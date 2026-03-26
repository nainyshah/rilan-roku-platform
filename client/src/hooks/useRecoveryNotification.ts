/**
 * useRecoveryNotification.ts
 *
 * Watches the global retry event bus and fires a `system.notifyOwner` mutation
 * exactly once whenever the server transitions from the "failed" state back to
 * "recovered". This gives the platform owner a push notification when an
 * outage resolves, without requiring any manual action.
 *
 * Design decisions:
 *   - Uses a module-level `_wasFailed` flag (not React state) so the transition
 *     detection is not affected by component re-renders or strict-mode double
 *     invocations.
 *   - The notification is fire-and-forget: if the mutation fails (e.g. because
 *     the user is not an admin), it logs a warning but does not surface an error
 *     to the UI.
 *   - A `_lastNotifiedAt` guard prevents duplicate notifications within a
 *     5-minute window in case the retry bus emits multiple `recovered` events
 *     in quick succession.
 *   - This hook must be mounted once at the app root (App.tsx) so it is always
 *     active regardless of which page the user is on.
 */

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { retryEvents } from '@/lib/retryEvents';
import { incrementNotificationCount } from '@/hooks/useNotificationCounter';

// ── Module-level deduplication guard ─────────────────────────────────────────
// Tracks whether the last known retry state was "failed" so we can detect
// the failed → recovered transition.
let _wasFailed = false;

// Prevents duplicate notifications within a 5-minute window.
let _lastNotifiedAt = 0;
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

export function useRecoveryNotification() {
  // Get a stable reference to the mutation without triggering re-renders.
  // We call mutate() imperatively from the event listener, not from JSX.
  const utils = trpc.useUtils();
  const notifyMutation = trpc.system.notifyOwner.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        console.info('[RecoveryNotification] Owner notified of service recovery.');
        // Increment the session-level counter so the Dashboard header badge updates.
        incrementNotificationCount();
      } else {
        console.warn('[RecoveryNotification] Notification delivery failed (upstream unavailable).');
      }
    },
    onError: (err) => {
      // Silently swallow FORBIDDEN errors — the logged-in user may not be admin.
      if (err.data?.code !== 'FORBIDDEN') {
        console.warn('[RecoveryNotification] Notification error:', err.message);
      }
    },
  });

  // Keep a stable ref to the mutate function so the event listener closure
  // always calls the latest version without needing to re-subscribe.
  const mutateRef = useRef(notifyMutation.mutate);
  useEffect(() => {
    mutateRef.current = notifyMutation.mutate;
  });

  useEffect(() => {
    const unsubscribe = retryEvents.subscribe((event) => {
      if (event.type === 'failed') {
        _wasFailed = true;
        return;
      }

      if (event.type === 'recovered' && _wasFailed) {
        _wasFailed = false;

        // Deduplication: skip if we notified recently
        const now = Date.now();
        if (now - _lastNotifiedAt < NOTIFY_COOLDOWN_MS) {
          console.info('[RecoveryNotification] Skipping duplicate notification (cooldown active).');
          return;
        }
        _lastNotifiedAt = now;

        const recoveredAt = new Date().toLocaleString();
        mutateRef.current({
          title: '✅ Service Recovered',
          content: `The RILAN Roku Content Platform backend has recovered from an outage and is now operational.\n\nRecovery time: ${recoveredAt}\n\nAll services should be functioning normally. No further action is required unless you notice ongoing issues.`,
        });
      }
    });

    return unsubscribe;
  }, []); // Empty deps — subscribe once, cleanup on unmount
}
