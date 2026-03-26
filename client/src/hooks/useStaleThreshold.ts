/**
 * useStaleThreshold.ts
 *
 * A singleton hook that manages the operator-configurable stale-data threshold.
 * The threshold controls how old `lastSyncedAt` can be before stat cards show
 * the amber "Stale" border and badge.
 *
 * Persisted to localStorage so the preference survives page reloads.
 * All components that call this hook share the same value and re-render
 * whenever it changes.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'rilan_stale_threshold_min';
const DEFAULT_MINUTES = 5;
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

// ── Module-level singleton ────────────────────────────────────────────────────

function loadThreshold(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MINUTES;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < MIN_MINUTES || n > MAX_MINUTES) return DEFAULT_MINUTES;
    return n;
  } catch {
    return DEFAULT_MINUTES;
  }
}

let _thresholdMinutes: number = loadThreshold();
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export function setStaleThreshold(minutes: number): void {
  const clamped = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
  _thresholdMinutes = clamped;
  try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch { /* ignore */ }
  _notify();
}

export function getStaleThresholdMs(): number {
  return _thresholdMinutes * 60 * 1000;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface StaleThreshold {
  /** Current threshold in minutes (1–60) */
  thresholdMinutes: number;
  /** Threshold in milliseconds for direct comparison */
  thresholdMs: number;
  /** Update the threshold (clamped to 1–60) */
  setThreshold: (minutes: number) => void;
  /** Default value for reset */
  defaultMinutes: number;
  /** Allowed range */
  minMinutes: number;
  maxMinutes: number;
}

export function useStaleThreshold(): StaleThreshold {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  return {
    thresholdMinutes: _thresholdMinutes,
    thresholdMs: _thresholdMinutes * 60 * 1000,
    setThreshold: setStaleThreshold,
    defaultMinutes: DEFAULT_MINUTES,
    minMinutes: MIN_MINUTES,
    maxMinutes: MAX_MINUTES,
  };
}
