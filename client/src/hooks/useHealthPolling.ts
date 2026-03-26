import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { retryEvents } from '@/lib/retryEvents';

const HEALTH_URL = '/api/health';
const FOCUS_STALE_THRESHOLD_MS = 30_000; // re-fetch only if tab was hidden ≥ 30 s
const HEALTH_TIMEOUT_MS = 8_000;

/**
 * useHealthPolling
 *
 * Registers two complementary recovery mechanisms:
 *
 * 1. **Focus-based refetch** — when the browser tab becomes visible again
 *    after being hidden for at least 30 seconds, this hook:
 *      a. Calls GET /api/health to confirm the server is reachable.
 *      b. If healthy, invalidates all React Query caches so stale data
 *         is refreshed in the background without a full page reload.
 *      c. Emits a `recovered` retry event so the ReconnectToast shows
 *         "Connection restored" if a previous failure had been displayed.
 *
 * 2. **Periodic background ping** — polls /api/health every 60 seconds
 *    while the tab is visible to detect server restarts early and keep
 *    the retry-event state accurate.
 *
 * Mount this hook once at the app root (e.g., inside App.tsx).
 */
export function useHealthPolling() {
  const queryClient = useQueryClient();
  const hiddenAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  const checkHealth = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(HEALTH_URL, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'include',
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  };

  const invalidateAllQueries = () => {
    // Invalidate every cached query so components re-fetch in the background.
    // This is non-blocking — components keep showing stale data until the
    // fresh response arrives.
    queryClient.invalidateQueries();
  };

  useEffect(() => {
    // ── Visibility change handler ──────────────────────────────────────────
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Tab became visible
      const hiddenDuration =
        hiddenAtRef.current != null
          ? Date.now() - hiddenAtRef.current
          : Infinity;
      hiddenAtRef.current = null;

      if (hiddenDuration < FOCUS_STALE_THRESHOLD_MS) return;

      // Tab was hidden long enough — check server health
      const healthy = await checkHealth();
      if (healthy) {
        invalidateAllQueries();
        retryEvents.emit({ type: 'recovered' });
      }
    };

    // ── Periodic background ping ───────────────────────────────────────────
    const startPolling = () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      intervalRef.current = setInterval(async () => {
        if (document.visibilityState !== 'visible') return;
        const healthy = await checkHealth();
        if (healthy) {
          retryEvents.emit({ type: 'recovered' });
        }
      }, 60_000);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isPollingRef.current = false;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
