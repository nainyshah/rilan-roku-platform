/**
 * useSyncStatus.ts
 *
 * A shared singleton hook that tracks:
 *   - lastSyncedAt: the exact timestamp of the most recent successful
 *     health-poll refetch (persisted to localStorage so it survives page reloads)
 *   - uptimePct: rolling 24-hour uptime percentage derived from health-poll
 *     outcomes (persisted to localStorage alongside the existing Dashboard history)
 *
 * This hook is the single source of truth for sync metadata consumed by:
 *   - Dashboard header "Last synced" label
 *   - Dashboard HealthBadge uptime percentage
 *   - Any future component that needs to know when data was last confirmed fresh
 *
 * It subscribes to the global retryEvents bus so it stays in sync with
 * useHealthPolling without requiring prop drilling.
 */

import { useEffect, useState } from 'react';
import { retryEvents } from '@/lib/retryEvents';

// ── Persistence keys ──────────────────────────────────────────────────────────
const LAST_SYNCED_KEY = 'rilan_last_synced_at';
const POLL_HISTORY_KEY = 'rilan_poll_uptime_history';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PollEntry {
  ts: number;   // Unix ms
  ok: boolean;  // true = healthy, false = failed
}

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Persistence helpers ───────────────────────────────────────────────────────
function loadLastSynced(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function saveLastSynced(d: Date): void {
  try { localStorage.setItem(LAST_SYNCED_KEY, d.toISOString()); } catch { /* ignore */ }
}

function loadPollHistory(): PollEntry[] {
  try {
    const raw = localStorage.getItem(POLL_HISTORY_KEY);
    if (!raw) return [];
    const parsed: PollEntry[] = JSON.parse(raw);
    const cutoff = Date.now() - WINDOW_MS;
    return parsed.filter((e) => e.ts >= cutoff);
  } catch {
    return [];
  }
}

function savePollHistory(history: PollEntry[]): void {
  try {
    const cutoff = Date.now() - WINDOW_MS;
    const pruned = history.filter((e) => e.ts >= cutoff);
    localStorage.setItem(POLL_HISTORY_KEY, JSON.stringify(pruned));
  } catch { /* ignore */ }
}

function computeUptime(history: PollEntry[]): number | null {
  const cutoff = Date.now() - WINDOW_MS;
  const window = history.filter((e) => e.ts >= cutoff);
  if (window.length < 2) return null;
  const up = window.filter((e) => e.ok).length;
  return Math.round((up / window.length) * 1000) / 10; // one decimal
}

// ── Module-level state (singleton across all hook instances) ──────────────────
// This ensures all components reading useSyncStatus see the same values
// without needing a React context.
let _lastSyncedAt: Date | null = loadLastSynced();
let _pollHistory: PollEntry[] = loadPollHistory();
let _uptimePct: number | null = computeUptime(_pollHistory);

// Listeners registered by hook instances
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

function _recordOutcome(ok: boolean) {
  const entry: PollEntry = { ts: Date.now(), ok };
  _pollHistory = [..._pollHistory, entry];
  savePollHistory(_pollHistory);
  _uptimePct = computeUptime(_pollHistory);

  if (ok) {
    _lastSyncedAt = new Date();
    saveLastSynced(_lastSyncedAt);
  }
  _notify();
}

// Subscribe to the global retry event bus once at module load time.
// This fires before any React component mounts, so the singleton is always
// up-to-date regardless of which components are rendered.
retryEvents.subscribe((event) => {
  if (event.type === 'recovered') _recordOutcome(true);
  if (event.type === 'failed')    _recordOutcome(false);
});

// ── Hook ──────────────────────────────────────────────────────────────────────
export interface SyncStatus {
  /** Timestamp of the last confirmed-healthy health poll. null until first success. */
  lastSyncedAt: Date | null;
  /** Rolling 24-hour uptime percentage (0–100, one decimal). null until ≥2 data points. */
  uptimePct: number | null;
  /** Number of poll entries in the 24-hour window. */
  pollCount: number;
}

/**
 * useSyncStatus
 *
 * Returns the current sync metadata and re-renders whenever a new health
 * poll outcome is recorded. Safe to call from multiple components simultaneously.
 */
export function useSyncStatus(): SyncStatus {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  return {
    lastSyncedAt: _lastSyncedAt,
    uptimePct: _uptimePct,
    pollCount: _pollHistory.filter((e) => e.ts >= Date.now() - WINDOW_MS).length,
  };
}

/**
 * Manually record a successful sync outcome.
 * Call this from useHealthPolling when a focus-based refetch succeeds.
 */
export function recordSyncSuccess() {
  _recordOutcome(true);
}

/**
 * Manually record a failed sync outcome.
 * Call this from useHealthPolling when a health check fails.
 */
export function recordSyncFailure() {
  _recordOutcome(false);
}
