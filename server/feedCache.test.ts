/**
 * feedCache.test.ts
 *
 * Unit tests for the in-memory TTL feed cache.
 * Tests the module-level functions: getCachedFeed, setCachedFeed,
 * invalidateFeedCache, purgeAllFeedCache, getFeedCacheStatus, getFeedCacheStatusForSlug.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// We need to reset the module-level cache map between tests.
// The simplest approach is to purge via the exported helper.
import {
  getCachedFeed,
  setCachedFeed,
  invalidateFeedCache,
  purgeAllFeedCache,
  getFeedCacheStatus,
  getFeedCacheStatusForSlug,
} from "./feedCache";

const SAMPLE_FEED = JSON.stringify({ providerName: "RILAN", language: "en", movies: [] });

describe("feedCache", () => {
  beforeEach(() => {
    purgeAllFeedCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── getCachedFeed ──────────────────────────────────────────────────────────

  it("returns null for a key that has never been set", () => {
    expect(getCachedFeed("unknown-slug")).toBeNull();
  });

  it("returns the stored entry immediately after set", () => {
    setCachedFeed("my-channel", SAMPLE_FEED);
    const entry = getCachedFeed("my-channel");
    expect(entry).not.toBeNull();
    expect(entry!.feedJson).toBe(SAMPLE_FEED);
    expect(entry!.slug).toBe("my-channel");
  });

  it("increments hitCount on each cache hit", () => {
    setCachedFeed("my-channel", SAMPLE_FEED);
    getCachedFeed("my-channel");
    getCachedFeed("my-channel");
    const entry = getCachedFeed("my-channel");
    expect(entry!.hitCount).toBe(3);
  });

  it("returns null after TTL has expired (default 5 min)", () => {
    setCachedFeed("my-channel", SAMPLE_FEED);
    // Advance past 5-minute default TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getCachedFeed("my-channel")).toBeNull();
  });

  it("returns entry just before TTL expires", () => {
    setCachedFeed("my-channel", SAMPLE_FEED);
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    expect(getCachedFeed("my-channel")).not.toBeNull();
  });

  it("respects a custom TTL", () => {
    setCachedFeed("my-channel", SAMPLE_FEED, 10_000); // 10s TTL
    vi.advanceTimersByTime(10_001);
    expect(getCachedFeed("my-channel")).toBeNull();
  });

  it("overwriting a key resets the TTL", () => {
    setCachedFeed("my-channel", SAMPLE_FEED, 300_000);
    vi.advanceTimersByTime(200_000); // 200s in
    setCachedFeed("my-channel", SAMPLE_FEED, 300_000); // reset TTL
    vi.advanceTimersByTime(200_000); // 200s more (400s total, but only 200s since reset)
    expect(getCachedFeed("my-channel")).not.toBeNull();
  });

  // ── invalidateFeedCache ────────────────────────────────────────────────────

  it("invalidates a specific key and returns true", () => {
    setCachedFeed("channel-a", SAMPLE_FEED);
    setCachedFeed("channel-b", SAMPLE_FEED);

    const result = invalidateFeedCache("channel-a");

    expect(result).toBe(true);
    expect(getCachedFeed("channel-a")).toBeNull();
    expect(getCachedFeed("channel-b")).not.toBeNull();
  });

  it("returns false when invalidating a key that does not exist", () => {
    expect(invalidateFeedCache("nonexistent")).toBe(false);
  });

  // ── purgeAllFeedCache ──────────────────────────────────────────────────────

  it("purges all keys and returns count", () => {
    setCachedFeed("channel-a", SAMPLE_FEED);
    setCachedFeed("channel-b", SAMPLE_FEED);

    const count = purgeAllFeedCache();

    expect(count).toBe(2);
    expect(getCachedFeed("channel-a")).toBeNull();
    expect(getCachedFeed("channel-b")).toBeNull();
  });

  it("purge on empty cache returns 0", () => {
    expect(purgeAllFeedCache()).toBe(0);
  });

  // ── getFeedCacheStatus ─────────────────────────────────────────────────────

  it("returns status for all cached entries", () => {
    setCachedFeed("channel-a", SAMPLE_FEED);
    setCachedFeed("channel-b", SAMPLE_FEED);

    const status = getFeedCacheStatus();
    expect(status).toHaveLength(2);
    const slugs = status.map((s) => s.slug);
    expect(slugs).toContain("channel-a");
    expect(slugs).toContain("channel-b");
  });

  it("marks expired entries as isExpired in status", () => {
    setCachedFeed("channel-a", SAMPLE_FEED, 300_000);
    vi.advanceTimersByTime(300_001);

    const status = getFeedCacheStatus();
    const entry = status.find((s) => s.slug === "channel-a");
    expect(entry?.isExpired).toBe(true);
  });

  // ── getFeedCacheStatusForSlug ──────────────────────────────────────────────

  it("returns cached: false for unknown slug", () => {
    const result = getFeedCacheStatusForSlug("unknown");
    expect(result.cached).toBe(false);
  });

  it("returns cached: true with metadata for a valid entry", () => {
    setCachedFeed("my-channel", SAMPLE_FEED, 300_000);
    const result = getFeedCacheStatusForSlug("my-channel");
    expect(result.cached).toBe(true);
    expect(result.hitCount).toBe(0);
    expect(result.expiresInMs).toBeGreaterThan(0);
  });

  it("returns cached: false for an expired entry", () => {
    setCachedFeed("my-channel", SAMPLE_FEED, 300_000);
    vi.advanceTimersByTime(300_001);
    const result = getFeedCacheStatusForSlug("my-channel");
    expect(result.cached).toBe(false);
  });
});
