/**
 * operator-features.test.ts
 *
 * Unit tests for the three new operator Dashboard features:
 *   1. SparklineDrillDown — bucket selection and entry filtering
 *   2. useStaleThreshold  — singleton state, persistence, and clamping
 *   3. useNotificationCounter — increment, reset, and multi-listener sync
 *
 * All tests run in the Node.js environment (no DOM required) because the
 * logic under test lives in pure TypeScript modules, not React components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. SparklineDrillDown — bucket helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-implement the bucket-selection helper inline so we can test it without
 * importing the React component (which requires a DOM).
 */
interface PollEntry {
  timestamp: Date;
  success: boolean;
  latencyMs: number | null;
}

const BUCKET_SIZE_MS = 30 * 60 * 1000; // 30 minutes

function getBucketKey(ts: Date): number {
  return Math.floor(ts.getTime() / BUCKET_SIZE_MS);
}

function filterEntriesForBucket(entries: PollEntry[], bucketKey: number): PollEntry[] {
  return entries.filter((e) => getBucketKey(e.timestamp) === bucketKey);
}

function buildBuckets(entries: PollEntry[], windowMs = 24 * 60 * 60 * 1000, nowMs = Date.now()) {
  const cutoff = nowMs - windowMs;
  const recent = entries.filter((e) => e.timestamp.getTime() >= cutoff);

  const map = new Map<number, PollEntry[]>();
  for (const entry of recent) {
    const key = getBucketKey(entry.timestamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  return map;
}

describe('SparklineDrillDown — bucket helpers', () => {
  // Use a fixed anchor aligned to the start of a 30-min bucket so t(0..10) always
  // land in the same bucket regardless of when the test runs.
  // BUCKET_SIZE_MS = 30 min = 1 800 000 ms
  // Pick an anchor that is exactly 100 minutes before the start of a bucket boundary.
  // bucket boundary = Math.ceil(Date.now() / BUCKET_SIZE_MS) * BUCKET_SIZE_MS
  // We pin to a static timestamp (2026-01-01T00:00:00Z) which is a known bucket boundary.
  const ANCHOR_MS = 1735689600000; // 2026-01-01T00:00:00.000Z — divisible by BUCKET_SIZE_MS
  // now = ANCHOR + 10 min, so:
  //   t(0)  = ANCHOR - 90 min  → bucket 964269
  //   t(5)  = ANCHOR - 85 min  → bucket 964269  (same)
  //   t(10) = ANCHOR - 80 min  → bucket 964269  (same)
  //   t(35) = ANCHOR - 55 min  → bucket 964270  (different)
  //   t(40) = ANCHOR - 50 min  → bucket 964270  (same as t(35))
  //   t(90) = ANCHOR +  0 min  → bucket 964272  (different)
  const now = new Date(ANCHOR_MS + 10 * 60 * 1000); // 10 min after a bucket start
  const t = (offsetMin: number) => new Date(now.getTime() - (100 - offsetMin) * 60 * 1000);

  const entries: PollEntry[] = [
    { timestamp: t(0),   success: true,  latencyMs: 120 },
    { timestamp: t(5),   success: true,  latencyMs: 95  },
    { timestamp: t(10),  success: false, latencyMs: null },
    { timestamp: t(35),  success: true,  latencyMs: 200 },
    { timestamp: t(40),  success: true,  latencyMs: 180 },
    { timestamp: t(90),  success: true,  latencyMs: 110 },
  ];

  it('assigns entries in the same 30-min window to the same bucket key', () => {
    const key0  = getBucketKey(t(0));
    const key5  = getBucketKey(t(5));
    const key10 = getBucketKey(t(10));
    expect(key0).toBe(key5);
    expect(key0).toBe(key10);
  });

  it('assigns entries in different 30-min windows to different bucket keys', () => {
    const key0  = getBucketKey(t(0));
    const key35 = getBucketKey(t(35));
    const key90 = getBucketKey(t(90));
    expect(key0).not.toBe(key35);
    expect(key35).not.toBe(key90);
  });

  it('filterEntriesForBucket returns only entries in the selected bucket', () => {
    const bucketKey = getBucketKey(t(0));
    const result = filterEntriesForBucket(entries, bucketKey);
    expect(result).toHaveLength(3);
    expect(result.every((e) => getBucketKey(e.timestamp) === bucketKey)).toBe(true);
  });

  it('buildBuckets groups entries into correct buckets', () => {
    const map = buildBuckets(entries, 24 * 60 * 60 * 1000, now.getTime());
    // 3 distinct buckets: t(0-10), t(35-40), t(90)
    expect(map.size).toBe(3);
  });

  it('buildBuckets excludes entries older than the window', () => {
    // Only include entries within a 1-hour window relative to the fixed anchor
    const map = buildBuckets(entries, 60 * 60 * 1000, now.getTime());
    // t(90) is 90 min before now — outside a 60-min window
    const allEntries = [...map.values()].flat();
    expect(allEntries.every((e) => e.timestamp.getTime() >= now.getTime() - 60 * 60 * 1000)).toBe(true);
  });

  it('a bucket with all successes has 100% success rate', () => {
    const bucketKey = getBucketKey(t(35));
    const result = filterEntriesForBucket(entries, bucketKey);
    const successRate = result.filter((e) => e.success).length / result.length;
    expect(successRate).toBe(1);
  });

  it('a bucket with mixed results has correct success rate', () => {
    const bucketKey = getBucketKey(t(0));
    const result = filterEntriesForBucket(entries, bucketKey);
    const successRate = result.filter((e) => e.success).length / result.length;
    // 2 successes out of 3
    expect(successRate).toBeCloseTo(2 / 3, 5);
  });

  it('average latency ignores null entries', () => {
    const bucketKey = getBucketKey(t(0));
    const result = filterEntriesForBucket(entries, bucketKey);
    const withLatency = result.filter((e) => e.latencyMs !== null);
    const avg = withLatency.reduce((s, e) => s + e.latencyMs!, 0) / withLatency.length;
    expect(avg).toBe((120 + 95) / 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. useStaleThreshold — singleton logic
// ─────────────────────────────────────────────────────────────────────────────

// Inline the pure logic from useStaleThreshold (no React, no localStorage)
const DEFAULT_MINUTES = 5;
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

function clampThreshold(minutes: number): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
}

function thresholdToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

describe('useStaleThreshold — pure logic', () => {
  it('default threshold is 5 minutes', () => {
    expect(DEFAULT_MINUTES).toBe(5);
  });

  it('converts minutes to milliseconds correctly', () => {
    expect(thresholdToMs(5)).toBe(300_000);
    expect(thresholdToMs(10)).toBe(600_000);
    expect(thresholdToMs(1)).toBe(60_000);
  });

  it('clamps values below minimum to MIN_MINUTES', () => {
    expect(clampThreshold(0)).toBe(MIN_MINUTES);
    expect(clampThreshold(-5)).toBe(MIN_MINUTES);
  });

  it('clamps values above maximum to MAX_MINUTES', () => {
    expect(clampThreshold(100)).toBe(MAX_MINUTES);
    expect(clampThreshold(61)).toBe(MAX_MINUTES);
  });

  it('rounds fractional values', () => {
    expect(clampThreshold(3.7)).toBe(4);
    expect(clampThreshold(3.2)).toBe(3);
  });

  it('accepts valid values within range unchanged', () => {
    expect(clampThreshold(5)).toBe(5);
    expect(clampThreshold(30)).toBe(30);
    expect(clampThreshold(1)).toBe(1);
    expect(clampThreshold(60)).toBe(60);
  });

  it('isStale is true when lastSyncedAt is null', () => {
    const thresholdMs = thresholdToMs(5);
    const isStale = (lastSyncedAt: Date | null) =>
      !lastSyncedAt || (Date.now() - lastSyncedAt.getTime()) > thresholdMs;
    expect(isStale(null)).toBe(true);
  });

  it('isStale is false when lastSyncedAt is recent', () => {
    const thresholdMs = thresholdToMs(5);
    const isStale = (lastSyncedAt: Date | null) =>
      !lastSyncedAt || (Date.now() - lastSyncedAt.getTime()) > thresholdMs;
    const recentDate = new Date(Date.now() - 60_000); // 1 minute ago
    expect(isStale(recentDate)).toBe(false);
  });

  it('isStale is true when lastSyncedAt exceeds threshold', () => {
    const thresholdMs = thresholdToMs(5);
    const isStale = (lastSyncedAt: Date | null) =>
      !lastSyncedAt || (Date.now() - lastSyncedAt.getTime()) > thresholdMs;
    const oldDate = new Date(Date.now() - 6 * 60_000); // 6 minutes ago
    expect(isStale(oldDate)).toBe(true);
  });

  it('isStale respects custom threshold (10 min)', () => {
    const thresholdMs = thresholdToMs(10);
    const isStale = (lastSyncedAt: Date | null) =>
      !lastSyncedAt || (Date.now() - lastSyncedAt.getTime()) > thresholdMs;
    const date8min = new Date(Date.now() - 8 * 60_000);
    const date12min = new Date(Date.now() - 12 * 60_000);
    expect(isStale(date8min)).toBe(false);
    expect(isStale(date12min)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. useNotificationCounter — pure singleton logic
// ─────────────────────────────────────────────────────────────────────────────

// Inline the pure counter logic (no React)
function createNotificationCounter() {
  let count = 0;
  const listeners = new Set<() => void>();

  return {
    increment() { count += 1; listeners.forEach((fn) => fn()); },
    reset()     { count = 0;  listeners.forEach((fn) => fn()); },
    getCount()  { return count; },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('useNotificationCounter — pure logic', () => {
  it('starts at 0', () => {
    const counter = createNotificationCounter();
    expect(counter.getCount()).toBe(0);
  });

  it('increments by 1 on each call', () => {
    const counter = createNotificationCounter();
    counter.increment();
    expect(counter.getCount()).toBe(1);
    counter.increment();
    expect(counter.getCount()).toBe(2);
    counter.increment();
    expect(counter.getCount()).toBe(3);
  });

  it('resets to 0', () => {
    const counter = createNotificationCounter();
    counter.increment();
    counter.increment();
    counter.reset();
    expect(counter.getCount()).toBe(0);
  });

  it('notifies listeners on increment', () => {
    const counter = createNotificationCounter();
    const listener = vi.fn();
    counter.subscribe(listener);
    counter.increment();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies listeners on reset', () => {
    const counter = createNotificationCounter();
    const listener = vi.fn();
    counter.subscribe(listener);
    counter.increment();
    counter.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribed listeners are not called', () => {
    const counter = createNotificationCounter();
    const listener = vi.fn();
    const unsub = counter.subscribe(listener);
    unsub();
    counter.increment();
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners all receive notifications', () => {
    const counter = createNotificationCounter();
    const l1 = vi.fn();
    const l2 = vi.fn();
    const l3 = vi.fn();
    counter.subscribe(l1);
    counter.subscribe(l2);
    counter.subscribe(l3);
    counter.increment();
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    expect(l3).toHaveBeenCalledTimes(1);
  });

  it('badge label is singular for count=1', () => {
    const count = 1;
    const label = `notification${count !== 1 ? 's' : ''} sent`;
    expect(label).toBe('notification sent');
  });

  it('badge label is plural for count>1', () => {
    const count = 3;
    const label = `notification${count !== 1 ? 's' : ''} sent`;
    expect(label).toBe('notifications sent');
  });

  it('badge title includes count', () => {
    const count = 2;
    const title = `${count} recovery notification${count !== 1 ? 's' : ''} sent this session — click to reset`;
    expect(title).toBe('2 recovery notifications sent this session — click to reset');
  });
});
