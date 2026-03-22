/**
 * Redis-backed feed cache with in-memory fallback.
 *
 * Uses Upstash Redis (TLS) when REDIS_URL is set.
 * Falls back to the existing in-memory feedCache when Redis is unavailable.
 *
 * Cache keys:  roku:feed:<slug>          → JSON string of the feed
 *              roku:feed:<slug>:meta      → JSON: { generatedAt, ttl }
 * TTL:         300 seconds (5 minutes) by default
 */

import Redis from "ioredis";
import {
  getCachedFeed,
  setCachedFeed,
  invalidateFeedCache as invalidateMemory,
  purgeAllFeedCache as purgeMemory,
  getFeedCacheStatus as getMemoryStats,
  type CacheEntry,
} from "./feedCache.js";

const FEED_TTL_SECONDS = 300; // 5 minutes
const KEY_PREFIX = "roku:feed:";

// ── Redis client (lazy, singleton) ─────────────────────────────────────────

let _redis: Redis | null = null;
let _redisReady = false;
let _initAttempted = false;

function getRedis(): Redis | null {
  if (_initAttempted) return _redisReady ? _redis : null;
  _initAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[FeedCache] REDIS_URL not set — using in-memory fallback");
    return null;
  }

  try {
    _redis = new Redis(url, {
      connectTimeout: 5000,
      lazyConnect: true,
      tls: url.startsWith("rediss://") ? {} : undefined,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop retrying after 3 attempts
        return Math.min(times * 200, 1000);
      },
      maxRetriesPerRequest: 1,
    });

    _redis.on("ready", () => {
      _redisReady = true;
      console.log("[FeedCache] Redis connected");
    });

    _redis.on("error", (err) => {
      if (_redisReady) {
        console.warn("[FeedCache] Redis error — falling back to in-memory:", err.message);
      }
      _redisReady = false;
    });

    _redis.on("close", () => {
      _redisReady = false;
    });

    // Kick off connection (non-blocking)
    _redis.connect().catch(() => {
      console.warn("[FeedCache] Redis initial connect failed — using in-memory fallback");
    });

    return _redis;
  } catch (err) {
    console.warn("[FeedCache] Redis init error:", (err as Error).message);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Retrieve a cached feed for the given channel slug. Returns null on miss. */
export async function getCachedFeedRedis(slug: string): Promise<string | null> {
  const redis = getRedis();

  if (redis && _redisReady) {
    try {
      const key = `${KEY_PREFIX}${slug}`;
      const value = await redis.get(key);
      if (value !== null) {
        console.log(`[FeedCache] Redis HIT: ${slug}`);
        return value;
      }
      console.log(`[FeedCache] Redis MISS: ${slug}`);
      return null;
    } catch (err) {
      console.warn("[FeedCache] Redis GET error, falling back:", (err as Error).message);
    }
  }

  // Fallback to in-memory
  const entry: CacheEntry | null = getCachedFeed(slug);
  return entry ? entry.feedJson : null;
}

/** Store a feed in the cache with the default TTL. */
export async function setCachedFeedRedis(slug: string, feedJson: string): Promise<void> {
  const redis = getRedis();

  if (redis && _redisReady) {
    try {
      const key = `${KEY_PREFIX}${slug}`;
      const metaKey = `${KEY_PREFIX}${slug}:meta`;
      const meta = JSON.stringify({ generatedAt: Date.now(), ttl: FEED_TTL_SECONDS });

      await Promise.all([
        redis.set(key, feedJson, "EX", FEED_TTL_SECONDS),
        redis.set(metaKey, meta, "EX", FEED_TTL_SECONDS + 60),
      ]);
      console.log(`[FeedCache] Redis SET: ${slug} (TTL ${FEED_TTL_SECONDS}s)`);
      return;
    } catch (err) {
      console.warn("[FeedCache] Redis SET error, falling back:", (err as Error).message);
    }
  }

  // Fallback to in-memory
  setCachedFeed(slug, feedJson);
}

/** Invalidate the cache for a specific channel slug. */
export async function invalidateFeedCacheRedis(slug: string): Promise<void> {
  const redis = getRedis();

  if (redis && _redisReady) {
    try {
      await redis.del(`${KEY_PREFIX}${slug}`, `${KEY_PREFIX}${slug}:meta`);
      console.log(`[FeedCache] Redis INVALIDATE: ${slug}`);
    } catch (err) {
      console.warn("[FeedCache] Redis DEL error:", (err as Error).message);
    }
  }

  // Always also clear in-memory in case of recent fallback
  invalidateMemory(slug);
}

/** Purge all cached feeds (all slugs). */
export async function purgeAllFeedCacheRedis(): Promise<number> {
  const redis = getRedis();
  let count = 0;

  if (redis && _redisReady) {
    try {
      const keys = await redis.keys(`${KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        count = keys.filter((k) => !k.endsWith(":meta")).length;
        console.log(`[FeedCache] Redis PURGE ALL: removed ${count} entries`);
      }
    } catch (err) {
      console.warn("[FeedCache] Redis PURGE error:", (err as Error).message);
    }
  }

  // Also purge in-memory
  purgeMemory();
  return count;
}

/** Get cache statistics (Redis + in-memory). */
export async function getFeedCacheStatsRedis(): Promise<{
  backend: "redis" | "memory";
  redisConnected: boolean;
  entries: Array<{ slug: string; generatedAt: number; ttlSeconds: number; expiresIn: number }>;
  totalEntries: number;
}> {
  const redis = getRedis();

  if (redis && _redisReady) {
    try {
      const metaKeys = await redis.keys(`${KEY_PREFIX}*:meta`);
      const entries: Array<{
        slug: string;
        generatedAt: number;
        ttlSeconds: number;
        expiresIn: number;
      }> = [];

      for (const metaKey of metaKeys) {
        const slug = metaKey.replace(KEY_PREFIX, "").replace(":meta", "");
        const [metaRaw, ttl] = await Promise.all([
          redis.get(metaKey),
          redis.ttl(`${KEY_PREFIX}${slug}`),
        ]);
        if (metaRaw) {
          const meta = JSON.parse(metaRaw) as { generatedAt: number; ttl: number };
          entries.push({
            slug,
            generatedAt: meta.generatedAt,
            ttlSeconds: meta.ttl,
            expiresIn: Math.max(0, ttl),
          });
        }
      }

      return {
        backend: "redis",
        redisConnected: true,
        entries,
        totalEntries: entries.length,
      };
    } catch (err) {
      console.warn("[FeedCache] Redis STATS error:", (err as Error).message);
    }
  }

  // Fallback to in-memory stats
  const memStats = getMemoryStats();
  return {
    backend: "memory",
    redisConnected: false,
    entries: memStats.map((e) => ({
      slug: e.slug,
      generatedAt: e.generatedAt,
      ttlSeconds: FEED_TTL_SECONDS,
      expiresIn: Math.max(0, Math.round((e.expiresAt - Date.now()) / 1000)),
    })),
    totalEntries: memStats.length,
  };
}

/** Check if Redis is currently connected. */
export function isRedisConnected(): boolean {
  return _redisReady;
}
