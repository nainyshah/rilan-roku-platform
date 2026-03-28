/**
 * usePollInterval.ts
 *
 * A singleton hook that manages the operator-configurable health-poll interval.
 * Controls how frequently useHealthPolling pings /api/health in the background.
 *
 * Range  : 10 s – 300 s (5 min)
 * Default: 60 s
 * Presets: 10 s, 30 s, 60 s, 120 s, 300 s
 *
 * Persisted to localStorage so the preference survives page reloads.
 * All components that call this hook share the same value and re-render
 * whenever it changes. useHealthPolling also subscribes so the live
 * interval restarts immediately without a page reload.
 *
 * Usage:
 *   const { intervalSeconds, setInterval: setPollInterval, presets } = usePollInterval();
 */

import { useEffect, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'rilan_poll_interval_sec';

export const DEFAULT_INTERVAL_SEC = 60;
export const MIN_INTERVAL_SEC     = 10;
export const MAX_INTERVAL_SEC     = 300;

export interface PollIntervalPreset {
  label: string;
  seconds: number;
  description: string;
}

export const POLL_INTERVAL_PRESETS: PollIntervalPreset[] = [
  { label: '10 s',  seconds: 10,  description: 'Aggressive — high server load' },
  { label: '30 s',  seconds: 30,  description: 'Fast — good for active monitoring' },
  { label: '60 s',  seconds: 60,  description: 'Default — balanced' },
  { label: '2 min', seconds: 120, description: 'Relaxed — low server load' },
  { label: '5 min', seconds: 300, description: 'Minimal — background only' },
];

// ── Module-level singleton ────────────────────────────────────────────────────

function loadInterval(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INTERVAL_SEC;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < MIN_INTERVAL_SEC || n > MAX_INTERVAL_SEC) return DEFAULT_INTERVAL_SEC;
    return n;
  } catch {
    return DEFAULT_INTERVAL_SEC;
  }
}

let _intervalSeconds: number = loadInterval();
const _listeners = new Set<() => void>();

function _notify(): void {
  _listeners.forEach((fn) => fn());
}

/**
 * Update the poll interval. Clamped to [MIN_INTERVAL_SEC, MAX_INTERVAL_SEC].
 * Persists to localStorage and notifies all subscribers immediately.
 */
export function setPollInterval(seconds: number): void {
  const clamped = Math.max(
    MIN_INTERVAL_SEC,
    Math.min(MAX_INTERVAL_SEC, Math.round(seconds)),
  );
  _intervalSeconds = clamped;
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    /* ignore storage errors in private browsing */
  }
  _notify();
}

/**
 * Read the current poll interval in milliseconds (for use in setInterval calls).
 */
export function getPollIntervalMs(): number {
  return _intervalSeconds * 1000;
}

/**
 * Subscribe to interval changes. Returns an unsubscribe function.
 * Used by useHealthPolling to restart the timer when the operator changes the setting.
 */
export function subscribePollInterval(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface PollIntervalState {
  /** Current interval in seconds (10–300) */
  intervalSeconds: number;
  /** Current interval in milliseconds */
  intervalMs: number;
  /** Update the interval (clamped to valid range) */
  setInterval: (seconds: number) => void;
  /** Reset to default (60 s) */
  reset: () => void;
  /** Whether the current value equals the default */
  isDefault: boolean;
  /** Preset options for quick selection */
  presets: PollIntervalPreset[];
  /** Range constants */
  minSeconds: number;
  maxSeconds: number;
  defaultSeconds: number;
}

export function usePollInterval(): PollIntervalState {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  return {
    intervalSeconds: _intervalSeconds,
    intervalMs: _intervalSeconds * 1000,
    setInterval: setPollInterval,
    reset: () => setPollInterval(DEFAULT_INTERVAL_SEC),
    isDefault: _intervalSeconds === DEFAULT_INTERVAL_SEC,
    presets: POLL_INTERVAL_PRESETS,
    minSeconds: MIN_INTERVAL_SEC,
    maxSeconds: MAX_INTERVAL_SEC,
    defaultSeconds: DEFAULT_INTERVAL_SEC,
  };
}
