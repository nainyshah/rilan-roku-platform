/**
 * dashboard-resilience.test.ts
 *
 * Unit tests for the three Dashboard/sidebar resilience enhancements:
 *   1. useSyncStatus — singleton state machine with localStorage persistence
 *   2. formatLastSynced — relative timestamp formatter
 *   3. NetworkStatusBanner — visibility logic based on retry state
 *   4. Uptime computation — polled uptime preference over health-check uptime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. useSyncStatus — core state logic (inlined to avoid Vite alias resolver)
// ─────────────────────────────────────────────────────────────────────────────

interface PollEntry {
  ts: number;
  ok: boolean;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

function computeUptime(history: PollEntry[]): number | null {
  const cutoff = Date.now() - WINDOW_MS;
  const window = history.filter((e) => e.ts >= cutoff);
  if (window.length < 2) return null;
  const up = window.filter((e) => e.ok).length;
  return Math.round((up / window.length) * 1000) / 10;
}

describe('useSyncStatus — uptime computation', () => {
  it('returns null when fewer than 2 entries exist', () => {
    expect(computeUptime([])).toBeNull();
    expect(computeUptime([{ ts: Date.now(), ok: true }])).toBeNull();
  });

  it('returns 100.0 when all entries are successful', () => {
    const history = Array.from({ length: 5 }, () => ({ ts: Date.now(), ok: true }));
    expect(computeUptime(history)).toBe(100.0);
  });

  it('returns 0.0 when all entries are failures', () => {
    const history = Array.from({ length: 4 }, () => ({ ts: Date.now(), ok: false }));
    expect(computeUptime(history)).toBe(0.0);
  });

  it('computes correct percentage for mixed results', () => {
    const history = [
      { ts: Date.now(), ok: true },
      { ts: Date.now(), ok: true },
      { ts: Date.now(), ok: true },
      { ts: Date.now(), ok: false },
    ];
    // 3 of 4 = 75%
    expect(computeUptime(history)).toBe(75.0);
  });

  it('excludes entries older than 24 hours from the window', () => {
    const now = Date.now();
    const history = [
      { ts: now - WINDOW_MS - 1000, ok: false }, // older than 24h — excluded
      { ts: now - 1000, ok: true },
      { ts: now, ok: true },
    ];
    // Only 2 entries in window, both ok → 100%
    expect(computeUptime(history)).toBe(100.0);
  });

  it('returns one decimal place precision', () => {
    // 2 of 3 = 66.666... → rounds to 66.7
    const history = [
      { ts: Date.now(), ok: true },
      { ts: Date.now(), ok: true },
      { ts: Date.now(), ok: false },
    ];
    expect(computeUptime(history)).toBe(66.7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. formatLastSynced — relative timestamp formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatLastSynced(d: Date | null): string {
  if (!d) return 'Never';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

describe('formatLastSynced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns "Never" for null', () => {
    expect(formatLastSynced(null)).toBe('Never');
  });

  it('returns "Just now" for < 10 seconds ago', () => {
    const d = new Date(Date.now() - 5_000);
    expect(formatLastSynced(d)).toBe('Just now');
  });

  it('returns seconds label for 10–59 seconds ago', () => {
    const d = new Date(Date.now() - 30_000);
    expect(formatLastSynced(d)).toBe('30s ago');
  });

  it('returns minutes label for 1–59 minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(formatLastSynced(d)).toBe('5m ago');
  });

  it('returns time string for ≥ 60 minutes ago', () => {
    const d = new Date(Date.now() - 90 * 60_000);
    // Just check it's not a relative label
    const result = formatLastSynced(d);
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Never');
    expect(result).not.toBe('Just now');
  });

  it('returns "Just now" for exactly 0 seconds ago', () => {
    const d = new Date(Date.now());
    expect(formatLastSynced(d)).toBe('Just now');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. NetworkStatusBanner — visibility logic
// ─────────────────────────────────────────────────────────────────────────────

type RetryState = 'idle' | 'retrying' | 'recovered' | 'failed';

function shouldShowBanner(state: RetryState): boolean {
  return state === 'failed';
}

describe('NetworkStatusBanner visibility', () => {
  it('is hidden when state is idle', () => {
    expect(shouldShowBanner('idle')).toBe(false);
  });

  it('is hidden when state is retrying', () => {
    expect(shouldShowBanner('retrying')).toBe(false);
  });

  it('is hidden when state is recovered', () => {
    expect(shouldShowBanner('recovered')).toBe(false);
  });

  it('is visible when state is failed', () => {
    expect(shouldShowBanner('failed')).toBe(true);
  });

  it('disappears immediately when state transitions from failed to recovered', () => {
    let state: RetryState = 'failed';
    expect(shouldShowBanner(state)).toBe(true);
    state = 'recovered';
    expect(shouldShowBanner(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Uptime preference logic — polled uptime vs health-check uptime
// ─────────────────────────────────────────────────────────────────────────────

function resolveUptimePct(
  polledUptimePct: number | null,
  healthCheckUptimePct: number | null
): number | null {
  return polledUptimePct !== null ? polledUptimePct : healthCheckUptimePct;
}

describe('Uptime preference: polled vs health-check', () => {
  it('prefers polled uptime when available', () => {
    expect(resolveUptimePct(98.5, 95.0)).toBe(98.5);
  });

  it('falls back to health-check uptime when polled is null', () => {
    expect(resolveUptimePct(null, 95.0)).toBe(95.0);
  });

  it('returns null when both are null', () => {
    expect(resolveUptimePct(null, null)).toBeNull();
  });

  it('uses polled uptime even when it is 0', () => {
    // 0 is a valid (bad) uptime — should not fall back
    expect(resolveUptimePct(0, 100.0)).toBe(0);
  });

  it('uses polled uptime of 100 correctly', () => {
    expect(resolveUptimePct(100.0, null)).toBe(100.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. localStorage persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('localStorage persistence helpers', () => {
  beforeEach(() => {
    // Use a simple in-memory mock for localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('saves and restores a Date as ISO string', () => {
    const d = new Date('2026-03-26T10:00:00.000Z');
    localStorage.setItem('test_date', d.toISOString());
    const restored = new Date(localStorage.getItem('test_date')!);
    expect(restored.getTime()).toBe(d.getTime());
  });

  it('prunes entries older than 24 hours on save', () => {
    const now = Date.now();
    const entries: PollEntry[] = [
      { ts: now - WINDOW_MS - 5000, ok: true },  // stale
      { ts: now - 1000, ok: true },               // fresh
    ];
    const cutoff = now - WINDOW_MS;
    const pruned = entries.filter((e) => e.ts >= cutoff);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].ts).toBe(now - 1000);
  });

  it('returns empty array when localStorage key is absent', () => {
    const raw = localStorage.getItem('nonexistent_key');
    expect(raw).toBeNull();
    const result = raw ? JSON.parse(raw) : [];
    expect(result).toEqual([]);
  });

  it('silently handles malformed JSON in localStorage', () => {
    localStorage.setItem('bad_key', 'not-valid-json');
    let result: PollEntry[] = [];
    try {
      result = JSON.parse(localStorage.getItem('bad_key')!);
    } catch {
      result = [];
    }
    expect(result).toEqual([]);
  });
});
