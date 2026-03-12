/**
 * feedCache.ts
 * In-memory TTL cache for Roku Direct Publisher feed JSON.
 * Keyed by channel slug. Default TTL: 5 minutes.
 */

export interface CacheEntry {
  slug: string;
  feedJson: string;
  generatedAt: number; // Unix ms
  expiresAt: number;   // Unix ms
  hitCount: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

/**
 * Get a cached feed string for a slug.
 * Returns null if the entry is missing or expired.
 */
export function getCachedFeed(slug: string): CacheEntry | null {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(slug);
    console.log(`[FeedCache] EXPIRED  slug=${slug}`);
    return null;
  }
  entry.hitCount++;
  const ageMs = Date.now() - entry.generatedAt;
  console.log(`[FeedCache] HIT      slug=${slug} age=${Math.round(ageMs / 1000)}s hits=${entry.hitCount}`);
  return entry;
}

/**
 * Store a feed string in the cache with a TTL.
 */
export function setCachedFeed(
  slug: string,
  feedJson: string,
  ttlMs: number = DEFAULT_TTL_MS
): CacheEntry {
  const now = Date.now();
  const entry: CacheEntry = {
    slug,
    feedJson,
    generatedAt: now,
    expiresAt: now + ttlMs,
    hitCount: 0,
  };
  cache.set(slug, entry);
  console.log(`[FeedCache] SET      slug=${slug} ttl=${Math.round(ttlMs / 1000)}s`);
  return entry;
}

/**
 * Invalidate (remove) the cache entry for a specific slug.
 * Call this whenever a channel's content changes.
 */
export function invalidateFeedCache(slug: string): boolean {
  const had = cache.has(slug);
  cache.delete(slug);
  if (had) console.log(`[FeedCache] INVALIDATE slug=${slug}`);
  return had;
}

/**
 * Purge all entries from the cache.
 */
export function purgeAllFeedCache(): number {
  const count = cache.size;
  cache.clear();
  console.log(`[FeedCache] PURGE_ALL cleared=${count}`);
  return count;
}

/**
 * Get cache status for all slugs (for admin UI).
 */
export function getFeedCacheStatus(): Array<{
  slug: string;
  generatedAt: number;
  expiresAt: number;
  expiresInMs: number;
  hitCount: number;
  isExpired: boolean;
}> {
  const now = Date.now();
  return Array.from(cache.values()).map((e) => ({
    slug: e.slug,
    generatedAt: e.generatedAt,
    expiresAt: e.expiresAt,
    expiresInMs: Math.max(0, e.expiresAt - now),
    hitCount: e.hitCount,
    isExpired: now > e.expiresAt,
  }));
}

/**
 * Get cache status for a single slug (for admin UI).
 */
export function getFeedCacheStatusForSlug(slug: string): {
  cached: boolean;
  generatedAt?: number;
  expiresAt?: number;
  expiresInMs?: number;
  hitCount?: number;
} {
  const entry = cache.get(slug);
  if (!entry) return { cached: false };
  const now = Date.now();
  const expired = now > entry.expiresAt;
  if (expired) {
    cache.delete(slug);
    return { cached: false };
  }
  return {
    cached: true,
    generatedAt: entry.generatedAt,
    expiresAt: entry.expiresAt,
    expiresInMs: Math.max(0, entry.expiresAt - now),
    hitCount: entry.hitCount,
  };
}
