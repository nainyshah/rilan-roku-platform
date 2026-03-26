/**
 * useNotificationCounter.ts
 *
 * A singleton hook that counts how many recovery notifications have been sent
 * to the platform owner during the current browser session.
 *
 * The counter increments each time useRecoveryNotification successfully fires
 * a notifyOwner mutation. It is session-only (not persisted to localStorage)
 * so it resets on page reload, giving operators a clear per-session count.
 *
 * Usage:
 *   const { count, reset } = useNotificationCounter();
 *
 * To increment from useRecoveryNotification, call:
 *   import { incrementNotificationCount } from '@/hooks/useNotificationCounter';
 *   incrementNotificationCount();
 */

import { useEffect, useState } from 'react';

// ── Module-level singleton ────────────────────────────────────────────────────

let _count = 0;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

/** Increment the counter by 1. Called from useRecoveryNotification on success. */
export function incrementNotificationCount(): void {
  _count += 1;
  _notify();
}

/** Reset the counter to 0. */
export function resetNotificationCount(): void {
  _count = 0;
  _notify();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface NotificationCounter {
  /** Number of recovery notifications sent this session */
  count: number;
  /** Reset the counter to 0 */
  reset: () => void;
}

export function useNotificationCounter(): NotificationCounter {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  return {
    count: _count,
    reset: resetNotificationCount,
  };
}
