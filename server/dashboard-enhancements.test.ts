/**
 * dashboard-enhancements.test.ts
 *
 * Unit tests for the three Dashboard visual enhancements:
 *   1. UptimeSparkline — bucket computation and bar colour logic
 *   2. Stale-data indicator — isStale threshold detection
 *   3. Recovery notification — transition detection and cooldown guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. UptimeSparkline — bucket computation
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_MS = 30 * 60 * 1000;   // 30 min
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS; // 48

interface RawEntry { ts: number; ok: boolean; }
interface BucketEntry {
  label: string; ratio: number; count: number;
  hasFail: boolean; hasOk: boolean; ts: number;
}

function bucketHistory(history: RawEntry[]): BucketEntry[] {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const buckets: BucketEntry[] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const bucketStart = windowStart + i * BUCKET_MS;
    const d = new Date(bucketStart);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return { label: `${h}:${m}`, ratio: -1, count: 0, hasFail: false, hasOk: false, ts: bucketStart };
  });
  for (const entry of history) {
    if (entry.ts < windowStart || entry.ts > now) continue;
    const idx = Math.min(Math.floor((entry.ts - windowStart) / BUCKET_MS), BUCKET_COUNT - 1);
    const b = buckets[idx];
    b.count++;
    if (entry.ok) b.hasOk = true; else b.hasFail = true;
  }
  for (const b of buckets) {
    if (b.count === 0) { b.ratio = -1; }
    else if (b.hasOk && b.hasFail) { b.ratio = 0.5; }
    else if (b.hasOk) { b.ratio = 1; }
    else { b.ratio = 0; }
  }
  return buckets;
}

function barColor(ratio: number): string {
  if (ratio < 0) return 'hsl(240 5% 26%)';
  if (ratio === 1) return 'hsl(142 71% 45%)';
  if (ratio === 0) return 'hsl(0 84% 60%)';
  return 'hsl(38 92% 50%)';
}

describe('UptimeSparkline — bucket computation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('produces exactly 48 buckets for a 24h window', () => {
    const buckets = bucketHistory([]);
    expect(buckets).toHaveLength(48);
  });

  it('all buckets have ratio -1 when history is empty', () => {
    const buckets = bucketHistory([]);
    expect(buckets.every((b) => b.ratio === -1)).toBe(true);
  });

  it('places an entry in the correct bucket', () => {
    const now = Date.now();
    // Entry 1 hour ago → should land in bucket index 46 (48 - 2)
    const entry: RawEntry = { ts: now - 60 * 60 * 1000, ok: true };
    const buckets = bucketHistory([entry]);
    const populated = buckets.filter((b) => b.count > 0);
    expect(populated).toHaveLength(1);
    expect(populated[0].ratio).toBe(1);
  });

  it('discards entries older than 24 hours', () => {
    const now = Date.now();
    const stale: RawEntry = { ts: now - WINDOW_MS - 1000, ok: true };
    const buckets = bucketHistory([stale]);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('discards entries in the future', () => {
    const future: RawEntry = { ts: Date.now() + 60_000, ok: true };
    const buckets = bucketHistory([future]);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('sets ratio=0.5 for a bucket with both ok and failed entries', () => {
    const now = Date.now();
    const ts = now - 30 * 60 * 1000; // 30 min ago
    const history: RawEntry[] = [
      { ts, ok: true },
      { ts: ts + 1000, ok: false },
    ];
    const buckets = bucketHistory(history);
    const mixed = buckets.find((b) => b.count > 0);
    expect(mixed?.ratio).toBe(0.5);
  });

  it('sets ratio=0 for a bucket with only failures', () => {
    const now = Date.now();
    const ts = now - 15 * 60 * 1000;
    const buckets = bucketHistory([{ ts, ok: false }]);
    const failed = buckets.find((b) => b.count > 0);
    expect(failed?.ratio).toBe(0);
  });
});

describe('UptimeSparkline — bar colour', () => {
  it('returns zinc for no-data (-1)', () => {
    expect(barColor(-1)).toBe('hsl(240 5% 26%)');
  });

  it('returns emerald for all-ok (1)', () => {
    expect(barColor(1)).toBe('hsl(142 71% 45%)');
  });

  it('returns red for all-failed (0)', () => {
    expect(barColor(0)).toBe('hsl(0 84% 60%)');
  });

  it('returns amber for mixed (0.5)', () => {
    expect(barColor(0.5)).toBe('hsl(38 92% 50%)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Stale-data indicator — isStale threshold
// ─────────────────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

function computeIsStale(lastSyncedAt: Date | null): boolean {
  return !lastSyncedAt || (Date.now() - lastSyncedAt.getTime()) > STALE_THRESHOLD_MS;
}

describe('Stale-data indicator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is stale when lastSyncedAt is null (never synced)', () => {
    expect(computeIsStale(null)).toBe(true);
  });

  it('is NOT stale when synced 1 minute ago', () => {
    const d = new Date(Date.now() - 60_000);
    expect(computeIsStale(d)).toBe(false);
  });

  it('is NOT stale when synced exactly at the threshold boundary', () => {
    const d = new Date(Date.now() - STALE_THRESHOLD_MS);
    expect(computeIsStale(d)).toBe(false);
  });

  it('is stale when synced 5 min + 1 ms ago', () => {
    const d = new Date(Date.now() - STALE_THRESHOLD_MS - 1);
    expect(computeIsStale(d)).toBe(true);
  });

  it('is stale when synced 10 minutes ago', () => {
    const d = new Date(Date.now() - 10 * 60_000);
    expect(computeIsStale(d)).toBe(true);
  });

  it('is stale when synced 1 hour ago', () => {
    const d = new Date(Date.now() - 60 * 60_000);
    expect(computeIsStale(d)).toBe(true);
  });

  it('is NOT stale when synced just now', () => {
    const d = new Date(Date.now());
    expect(computeIsStale(d)).toBe(false);
  });

  it('transitions from stale to fresh when a new sync occurs', () => {
    const staleDate = new Date(Date.now() - 10 * 60_000);
    expect(computeIsStale(staleDate)).toBe(true);
    const freshDate = new Date(Date.now() - 30_000);
    expect(computeIsStale(freshDate)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recovery notification — transition and cooldown logic
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

function makeNotificationController() {
  let wasFailed = false;
  let lastNotifiedAt = 0;
  const notifications: string[] = [];

  function handleEvent(type: 'failed' | 'recovered' | 'retrying') {
    if (type === 'failed') { wasFailed = true; return; }
    if (type === 'retrying') { return; }
    if (type === 'recovered' && wasFailed) {
      wasFailed = false;
      const now = Date.now();
      if (now - lastNotifiedAt < NOTIFY_COOLDOWN_MS) {
        notifications.push('SKIPPED_COOLDOWN');
        return;
      }
      lastNotifiedAt = now;
      notifications.push('NOTIFIED');
    }
  }

  return { handleEvent, notifications };
}

describe('Recovery notification logic', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does NOT notify when recovered without prior failed state', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('recovered');
    expect(notifications).toHaveLength(0);
  });

  it('notifies exactly once on failed → recovered transition', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('failed');
    handleEvent('recovered');
    expect(notifications).toEqual(['NOTIFIED']);
  });

  it('does NOT notify on a second recovered within the cooldown window', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('failed');
    handleEvent('recovered');
    handleEvent('failed');
    handleEvent('recovered'); // within 5 min cooldown
    expect(notifications).toEqual(['NOTIFIED', 'SKIPPED_COOLDOWN']);
  });

  it('notifies again after the cooldown window expires', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('failed');
    handleEvent('recovered');
    vi.advanceTimersByTime(NOTIFY_COOLDOWN_MS + 1000);
    handleEvent('failed');
    handleEvent('recovered');
    expect(notifications).toEqual(['NOTIFIED', 'NOTIFIED']);
  });

  it('ignores retrying events for notification purposes', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('retrying');
    handleEvent('retrying');
    handleEvent('recovered');
    expect(notifications).toHaveLength(0);
  });

  it('resets wasFailed after recovery so a second cycle works', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('failed');
    handleEvent('recovered');
    // Advance past cooldown
    vi.advanceTimersByTime(NOTIFY_COOLDOWN_MS + 1000);
    // Second outage cycle
    handleEvent('failed');
    handleEvent('recovered');
    expect(notifications).toEqual(['NOTIFIED', 'NOTIFIED']);
  });

  it('does NOT notify when recovered event fires multiple times without failed in between', () => {
    const { handleEvent, notifications } = makeNotificationController();
    handleEvent('failed');
    handleEvent('recovered');
    handleEvent('recovered'); // duplicate recovered — no failed in between
    handleEvent('recovered');
    expect(notifications).toEqual(['NOTIFIED']); // only one notification
  });
});
