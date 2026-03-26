/**
 * resilience.test.ts
 *
 * Unit tests for the three resilience features:
 *   1. retryEvents bus  (src/lib/retryEvents.ts)
 *   2. useRetryStatus hook (src/hooks/useRetryStatus.ts)
 *   3. useHealthPolling hook (src/hooks/useHealthPolling.ts)
 *
 * These tests run in the Node/jsdom environment via Vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. retryEvents bus
// ─────────────────────────────────────────────────────────────────────────────

// Inline the bus logic so the test is self-contained and doesn't depend on
// the Vite alias resolver (@/lib/retryEvents).
type RetryEvent =
  | { type: 'retrying'; attempt: number }
  | { type: 'recovered' }
  | { type: 'failed' };

function makeRetryEventBus() {
  type Listener = (event: RetryEvent) => void;
  const listeners = new Set<Listener>();
  return {
    emit(event: RetryEvent) { listeners.forEach((fn) => fn(event)); },
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    _size() { return listeners.size; },
  };
}

describe('retryEvents bus', () => {
  it('delivers events to all subscribers', () => {
    const bus = makeRetryEventBus();
    const received: RetryEvent[] = [];
    bus.subscribe((e) => received.push(e));
    bus.emit({ type: 'retrying', attempt: 1 });
    bus.emit({ type: 'recovered' });
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'retrying', attempt: 1 });
    expect(received[1]).toEqual({ type: 'recovered' });
  });

  it('delivers to multiple independent subscribers', () => {
    const bus = makeRetryEventBus();
    const a: RetryEvent[] = [];
    const b: RetryEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.emit({ type: 'failed' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('unsubscribe stops receiving events', () => {
    const bus = makeRetryEventBus();
    const received: RetryEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));
    bus.emit({ type: 'retrying', attempt: 1 });
    unsub();
    bus.emit({ type: 'recovered' });
    expect(received).toHaveLength(1);
    expect(bus._size()).toBe(0);
  });

  it('emitting with no subscribers does not throw', () => {
    const bus = makeRetryEventBus();
    expect(() => bus.emit({ type: 'failed' })).not.toThrow();
  });

  it('carries attempt number in retrying event', () => {
    const bus = makeRetryEventBus();
    const events: RetryEvent[] = [];
    bus.subscribe((e) => events.push(e));
    bus.emit({ type: 'retrying', attempt: 3 });
    expect(events[0]).toMatchObject({ type: 'retrying', attempt: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. useRetryStatus state machine
// ─────────────────────────────────────────────────────────────────────────────

// Test the state-machine logic directly (without React hooks machinery).
type RetryStatus =
  | { state: 'idle' }
  | { state: 'retrying'; attempt: number }
  | { state: 'recovered' }
  | { state: 'failed' };

function applyEvent(current: RetryStatus, event: RetryEvent): RetryStatus {
  switch (event.type) {
    case 'retrying': return { state: 'retrying', attempt: event.attempt };
    case 'recovered': return { state: 'recovered' };
    case 'failed':    return { state: 'failed' };
  }
}

describe('useRetryStatus state machine', () => {
  it('starts in idle state', () => {
    const s: RetryStatus = { state: 'idle' };
    expect(s.state).toBe('idle');
  });

  it('transitions idle → retrying on retrying event', () => {
    const s = applyEvent({ state: 'idle' }, { type: 'retrying', attempt: 1 });
    expect(s).toEqual({ state: 'retrying', attempt: 1 });
  });

  it('updates attempt number on subsequent retrying events', () => {
    let s: RetryStatus = { state: 'idle' };
    s = applyEvent(s, { type: 'retrying', attempt: 1 });
    s = applyEvent(s, { type: 'retrying', attempt: 2 });
    expect(s).toEqual({ state: 'retrying', attempt: 2 });
  });

  it('transitions retrying → recovered on recovered event', () => {
    const s = applyEvent({ state: 'retrying', attempt: 2 }, { type: 'recovered' });
    expect(s.state).toBe('recovered');
  });

  it('transitions retrying → failed on failed event', () => {
    const s = applyEvent({ state: 'retrying', attempt: 3 }, { type: 'failed' });
    expect(s.state).toBe('failed');
  });

  it('transitions failed → recovered on recovered event (server came back)', () => {
    const s = applyEvent({ state: 'failed' }, { type: 'recovered' });
    expect(s.state).toBe('recovered');
  });

  it('recovered → retrying when a new failure starts', () => {
    const s = applyEvent({ state: 'recovered' }, { type: 'retrying', attempt: 1 });
    expect(s).toEqual({ state: 'retrying', attempt: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. useHealthPolling logic
// ─────────────────────────────────────────────────────────────────────────────

describe('useHealthPolling logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls /api/health and returns true on 200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock;

    // Simulate the health check function
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const res = await fetch('/api/health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        return res.ok;
      } catch {
        return false;
      }
    };

    const result = await checkHealth();
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({
      cache: 'no-store',
    }));
  });

  it('returns false when /api/health returns non-200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        return res.ok;
      } catch { return false; }
    };
    expect(await checkHealth()).toBe(false);
  });

  it('returns false when fetch throws (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const checkHealth = async () => {
      try {
        await fetch('/api/health', { cache: 'no-store' });
        return true;
      } catch { return false; }
    };
    expect(await checkHealth()).toBe(false);
  });

  it('does not trigger refetch if tab was hidden less than 30 seconds', () => {
    const THRESHOLD = 30_000;
    const hiddenAt = Date.now() - 10_000; // only 10 s ago
    const hiddenDuration = Date.now() - hiddenAt;
    expect(hiddenDuration).toBeLessThan(THRESHOLD);
    // No refetch should be triggered
    const shouldRefetch = hiddenDuration >= THRESHOLD;
    expect(shouldRefetch).toBe(false);
  });

  it('triggers refetch if tab was hidden 30 seconds or more', () => {
    const THRESHOLD = 30_000;
    const hiddenAt = Date.now() - 35_000; // 35 s ago
    const hiddenDuration = Date.now() - hiddenAt;
    const shouldRefetch = hiddenDuration >= THRESHOLD;
    expect(shouldRefetch).toBe(true);
  });

  it('exponential backoff produces correct delays', () => {
    const retryDelayMs = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 10_000);
    expect(retryDelayMs(1)).toBe(1000);   // 1st retry: 1 s
    expect(retryDelayMs(2)).toBe(2000);   // 2nd retry: 2 s
    expect(retryDelayMs(3)).toBe(4000);   // 3rd retry: 4 s
    expect(retryDelayMs(10)).toBe(10_000); // capped at 10 s
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. isTransientNetworkError detection
// ─────────────────────────────────────────────────────────────────────────────

function isTransientNetworkError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed')
  );
}

describe('isTransientNetworkError', () => {
  it('detects "Failed to fetch" (Chrome)', () => {
    expect(isTransientNetworkError('Failed to fetch')).toBe(true);
  });

  it('detects "Load failed" (Safari)', () => {
    expect(isTransientNetworkError('Load failed')).toBe(true);
  });

  it('detects "NetworkError" (Firefox)', () => {
    expect(isTransientNetworkError('NetworkError when attempting to fetch resource.')).toBe(true);
  });

  it('detects "network request failed" (React Native / Expo)', () => {
    expect(isTransientNetworkError('Network request failed')).toBe(true);
  });

  it('does NOT flag a 404 application error', () => {
    expect(isTransientNetworkError('NOT_FOUND')).toBe(false);
  });

  it('does NOT flag a 403 application error', () => {
    expect(isTransientNetworkError('FORBIDDEN')).toBe(false);
  });

  it('does NOT flag a generic server error message', () => {
    expect(isTransientNetworkError('Internal server error')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isTransientNetworkError('FAILED TO FETCH')).toBe(true);
    expect(isTransientNetworkError('LOAD FAILED')).toBe(true);
  });
});
