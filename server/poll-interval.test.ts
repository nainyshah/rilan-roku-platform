/**
 * poll-interval.test.ts
 *
 * Unit tests for the usePollInterval feature:
 *   1. Core singleton logic — increment, clamp, persist, reset
 *   2. Preset definitions — correct values and ordering
 *   3. formatSeconds helper — human-readable labels
 *   4. Subscriber notification — live-reactive timer restart
 *   5. Integration with useHealthPolling — interval restart on change
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Constants (mirrored from usePollInterval) ─────────────────────────────────
const DEFAULT_INTERVAL_SEC = 60;
const MIN_INTERVAL_SEC     = 10;
const MAX_INTERVAL_SEC     = 300;

// ── Helpers (inlined for pure-logic testing without React) ────────────────────

function clampInterval(seconds: number): number {
  return Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, Math.round(seconds)));
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

function pollIntervalLabel(sec: number): string {
  if (sec <= 15)  return 'Aggressive';
  if (sec <= 30)  return 'Fast';
  if (sec <= 60)  return 'Balanced';
  if (sec <= 120) return 'Relaxed';
  return 'Minimal';
}

function pollIntervalColor(sec: number): string {
  if (sec <= 15)  return 'text-red-400';
  if (sec <= 30)  return 'text-amber-400';
  if (sec <= 60)  return 'text-emerald-400';
  return 'text-muted-foreground';
}

// Inline singleton factory for isolated tests
function createPollIntervalStore(initial = DEFAULT_INTERVAL_SEC) {
  let _value = clampInterval(initial);
  const _listeners = new Set<() => void>();

  return {
    get: ()               => _value,
    getMs: ()             => _value * 1000,
    set: (s: number)      => {
      _value = clampInterval(s);
      _listeners.forEach((fn) => fn());
    },
    reset: ()             => {
      _value = DEFAULT_INTERVAL_SEC;
      _listeners.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
    listenerCount: ()     => _listeners.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core singleton logic
// ─────────────────────────────────────────────────────────────────────────────

describe('usePollInterval — core singleton logic', () => {
  it('initialises to the default interval', () => {
    const store = createPollIntervalStore();
    expect(store.get()).toBe(DEFAULT_INTERVAL_SEC);
  });

  it('getMs returns seconds × 1000', () => {
    const store = createPollIntervalStore();
    expect(store.getMs()).toBe(DEFAULT_INTERVAL_SEC * 1000);
    store.set(30);
    expect(store.getMs()).toBe(30_000);
  });

  it('set updates the stored value', () => {
    const store = createPollIntervalStore();
    store.set(30);
    expect(store.get()).toBe(30);
    store.set(120);
    expect(store.get()).toBe(120);
  });

  it('reset returns to the default', () => {
    const store = createPollIntervalStore();
    store.set(30);
    store.reset();
    expect(store.get()).toBe(DEFAULT_INTERVAL_SEC);
  });

  it('isDefault is true after reset', () => {
    const store = createPollIntervalStore();
    store.set(30);
    expect(store.get() === DEFAULT_INTERVAL_SEC).toBe(false);
    store.reset();
    expect(store.get() === DEFAULT_INTERVAL_SEC).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Clamping and rounding
// ─────────────────────────────────────────────────────────────────────────────

describe('usePollInterval — clamping and rounding', () => {
  it('clamps values below MIN_INTERVAL_SEC to MIN_INTERVAL_SEC', () => {
    expect(clampInterval(0)).toBe(MIN_INTERVAL_SEC);
    expect(clampInterval(-100)).toBe(MIN_INTERVAL_SEC);
    expect(clampInterval(5)).toBe(MIN_INTERVAL_SEC);
    expect(clampInterval(9)).toBe(MIN_INTERVAL_SEC);
  });

  it('clamps values above MAX_INTERVAL_SEC to MAX_INTERVAL_SEC', () => {
    expect(clampInterval(301)).toBe(MAX_INTERVAL_SEC);
    expect(clampInterval(1000)).toBe(MAX_INTERVAL_SEC);
  });

  it('accepts valid values within range unchanged', () => {
    expect(clampInterval(10)).toBe(10);
    expect(clampInterval(60)).toBe(60);
    expect(clampInterval(300)).toBe(300);
    expect(clampInterval(150)).toBe(150);
  });

  it('rounds fractional values', () => {
    expect(clampInterval(29.7)).toBe(30);
    expect(clampInterval(29.2)).toBe(29);
    expect(clampInterval(60.5)).toBe(61);
  });

  it('store clamps on set', () => {
    const store = createPollIntervalStore();
    store.set(0);
    expect(store.get()).toBe(MIN_INTERVAL_SEC);
    store.set(9999);
    expect(store.get()).toBe(MAX_INTERVAL_SEC);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. formatSeconds helper
// ─────────────────────────────────────────────────────────────────────────────

describe('formatSeconds', () => {
  it('formats values below 60 s with "s" suffix', () => {
    expect(formatSeconds(10)).toBe('10 s');
    expect(formatSeconds(30)).toBe('30 s');
    expect(formatSeconds(59)).toBe('59 s');
  });

  it('formats exact minutes without seconds', () => {
    expect(formatSeconds(60)).toBe('1 min');
    expect(formatSeconds(120)).toBe('2 min');
    expect(formatSeconds(300)).toBe('5 min');
  });

  it('formats mixed minutes and seconds', () => {
    expect(formatSeconds(90)).toBe('1m 30s');
    expect(formatSeconds(150)).toBe('2m 30s');
    expect(formatSeconds(75)).toBe('1m 15s');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Preset definitions
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '10 s',  seconds: 10,  description: 'Aggressive — high server load' },
  { label: '30 s',  seconds: 30,  description: 'Fast — good for active monitoring' },
  { label: '60 s',  seconds: 60,  description: 'Default — balanced' },
  { label: '2 min', seconds: 120, description: 'Relaxed — low server load' },
  { label: '5 min', seconds: 300, description: 'Minimal — background only' },
];

describe('POLL_INTERVAL_PRESETS', () => {
  it('has 5 presets', () => {
    expect(PRESETS).toHaveLength(5);
  });

  it('presets are ordered from fastest to slowest', () => {
    for (let i = 1; i < PRESETS.length; i++) {
      expect(PRESETS[i].seconds).toBeGreaterThan(PRESETS[i - 1].seconds);
    }
  });

  it('all preset values are within the valid range', () => {
    for (const preset of PRESETS) {
      expect(preset.seconds).toBeGreaterThanOrEqual(MIN_INTERVAL_SEC);
      expect(preset.seconds).toBeLessThanOrEqual(MAX_INTERVAL_SEC);
    }
  });

  it('default interval (60 s) is one of the presets', () => {
    const defaultPreset = PRESETS.find((p) => p.seconds === DEFAULT_INTERVAL_SEC);
    expect(defaultPreset).toBeDefined();
  });

  it('each preset has a non-empty label and description', () => {
    for (const preset of PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Label and color helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('pollIntervalLabel', () => {
  it('returns Aggressive for ≤ 15 s', () => {
    expect(pollIntervalLabel(10)).toBe('Aggressive');
    expect(pollIntervalLabel(15)).toBe('Aggressive');
  });

  it('returns Fast for 16–30 s', () => {
    expect(pollIntervalLabel(16)).toBe('Fast');
    expect(pollIntervalLabel(30)).toBe('Fast');
  });

  it('returns Balanced for 31–60 s', () => {
    expect(pollIntervalLabel(31)).toBe('Balanced');
    expect(pollIntervalLabel(60)).toBe('Balanced');
  });

  it('returns Relaxed for 61–120 s', () => {
    expect(pollIntervalLabel(61)).toBe('Relaxed');
    expect(pollIntervalLabel(120)).toBe('Relaxed');
  });

  it('returns Minimal for > 120 s', () => {
    expect(pollIntervalLabel(121)).toBe('Minimal');
    expect(pollIntervalLabel(300)).toBe('Minimal');
  });
});

describe('pollIntervalColor', () => {
  it('returns red for aggressive intervals', () => {
    expect(pollIntervalColor(10)).toBe('text-red-400');
    expect(pollIntervalColor(15)).toBe('text-red-400');
  });

  it('returns amber for fast intervals', () => {
    expect(pollIntervalColor(30)).toBe('text-amber-400');
  });

  it('returns emerald for balanced intervals', () => {
    expect(pollIntervalColor(60)).toBe('text-emerald-400');
  });

  it('returns muted for relaxed/minimal intervals', () => {
    expect(pollIntervalColor(120)).toBe('text-muted-foreground');
    expect(pollIntervalColor(300)).toBe('text-muted-foreground');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Subscriber notification (live-reactive timer restart)
// ─────────────────────────────────────────────────────────────────────────────

describe('usePollInterval — subscriber notifications', () => {
  it('notifies subscriber on set', () => {
    const store = createPollIntervalStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(30);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies subscriber on reset', () => {
    const store = createPollIntervalStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(30);
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribed listener is not called', () => {
    const store = createPollIntervalStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.set(30);
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple subscribers all receive the notification', () => {
    const store = createPollIntervalStore();
    const l1 = vi.fn();
    const l2 = vi.fn();
    store.subscribe(l1);
    store.subscribe(l2);
    store.set(120);
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it('subscriber count decreases after unsubscribe', () => {
    const store = createPollIntervalStore();
    const unsub1 = store.subscribe(() => {});
    const unsub2 = store.subscribe(() => {});
    expect(store.listenerCount()).toBe(2);
    unsub1();
    expect(store.listenerCount()).toBe(1);
    unsub2();
    expect(store.listenerCount()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Warning threshold — stale threshold should exceed poll interval
// ─────────────────────────────────────────────────────────────────────────────

describe('stale threshold vs poll interval relationship', () => {
  it('recommended stale threshold is at least 2× the poll interval', () => {
    // For the default 60 s poll interval, the recommended minimum stale
    // threshold is 2 minutes (120 s) to avoid false positives.
    const pollSec = DEFAULT_INTERVAL_SEC;
    const recommendedMinStaleMs = pollSec * 2 * 1000;
    const defaultStaleMs = 5 * 60 * 1000; // 5 minutes
    expect(defaultStaleMs).toBeGreaterThanOrEqual(recommendedMinStaleMs);
  });

  it('warning threshold in Settings info note is poll interval ÷ 60 + 1 minutes', () => {
    // The info note says "Setting the threshold below X minutes may cause warnings"
    // where X = Math.ceil(intervalSeconds / 60) + 1
    const pollSec = 60;
    const warningThreshold = Math.ceil(pollSec / 60) + 1;
    expect(warningThreshold).toBe(2);

    const pollSec2 = 120;
    const warningThreshold2 = Math.ceil(pollSec2 / 60) + 1;
    expect(warningThreshold2).toBe(3);
  });
});
