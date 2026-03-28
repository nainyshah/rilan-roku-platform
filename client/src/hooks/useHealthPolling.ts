import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { retryEvents } from '@/lib/retryEvents';
import { recordSyncSuccess, recordSyncFailure } from '@/hooks/useSyncStatus';
import { getPollIntervalMs, subscribePollInterval } from '@/hooks/usePollInterval';

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
 * 2. **Periodic background ping** — polls /api/health at the operator-
 *    configured interval (default 60 s, range 10 s – 300 s, set via the
 *    Settings page). The interval is live-reactive: changing it in Settings
 *    restarts the timer immediately without a page reload.
 *
 * Latency (round-trip ms) is measured for every poll and forwarded to
 * recordSyncSuccess/recordSyncFailure so the SparklineDrillDown panel
 * can display response times per 30-minute bucket.
 *
 * Mount this hook once at the app root (e.g., inside App.tsx).
 */
export function useHealthPolling() {
  const queryClient = useQueryClient();
  const hiddenAtRef  = useRef<number | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Fetch /api/health and return { healthy, latencyMs }.
   * latencyMs is the wall-clock round-trip time regardless of success/failure.
   */
  const checkHealth = async (): Promise<{ healthy: boolean; latencyMs: number }> => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(HEALTH_URL, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'include',
      });
      clearTimeout(timeoutId);
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  };

  const invalidateAllQueries = () => {
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
      const { healthy, latencyMs } = await checkHealth();
      if (healthy) {
        invalidateAllQueries();
        retryEvents.emit({ type: 'recovered' });
        recordSyncSuccess(latencyMs);
      } else {
        recordSyncFailure(latencyMs);
      }
    };

    // ── Periodic background ping ───────────────────────────────────────────
    // Starts (or restarts) the interval timer using the current poll interval.
    // Called on mount and whenever the operator changes the interval in Settings.
    const startPolling = () => {
      // Always clear any existing timer before starting a new one
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const currentIntervalMs = getPollIntervalMs();
      intervalRef.current = setInterval(async () => {
        if (document.visibilityState !== 'visible') return;
        const { healthy, latencyMs } = await checkHealth();
        if (healthy) {
          retryEvents.emit({ type: 'recovered' });
          recordSyncSuccess(latencyMs);
        } else {
          recordSyncFailure(latencyMs);
        }
      }, currentIntervalMs);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Subscribe to interval changes so the timer restarts live when the
    // operator adjusts the slider in Settings — no page reload required.
    const unsubscribeInterval = subscribePollInterval(() => {
      startPolling(); // clear old timer and start a new one with updated interval
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
      unsubscribeInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
