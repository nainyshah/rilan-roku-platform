import { useEffect, useState } from 'react';
import { retryEvents, RetryEvent } from '@/lib/retryEvents';

export type RetryStatus =
  | { state: 'idle' }
  | { state: 'retrying'; attempt: number }
  | { state: 'recovered' }
  | { state: 'failed' };

/**
 * useRetryStatus
 *
 * Subscribes to the global retry event bus and returns the current
 * retry state so components can render appropriate UI.
 *
 * States:
 *   idle      — no retry in progress
 *   retrying  — at least one retry attempt is underway (attempt = 1-based count)
 *   recovered — last retry succeeded; auto-resets to idle after a short delay
 *   failed    — all retries exhausted; stays until user action
 */
export function useRetryStatus(): RetryStatus {
  const [status, setStatus] = useState<RetryStatus>({ state: 'idle' });

  useEffect(() => {
    let recoveredTimer: ReturnType<typeof setTimeout> | null = null;

    const handleEvent = (event: RetryEvent) => {
      if (recoveredTimer) {
        clearTimeout(recoveredTimer);
        recoveredTimer = null;
      }

      switch (event.type) {
        case 'retrying':
          setStatus({ state: 'retrying', attempt: event.attempt });
          break;
        case 'recovered':
          setStatus({ state: 'recovered' });
          // Auto-reset to idle after 3 seconds so the "Connected" toast fades
          recoveredTimer = setTimeout(() => {
            setStatus({ state: 'idle' });
          }, 3000);
          break;
        case 'failed':
          setStatus({ state: 'failed' });
          break;
      }
    };

    const unsubscribe = retryEvents.subscribe(handleEvent);
    return () => {
      unsubscribe();
      if (recoveredTimer) clearTimeout(recoveredTimer);
    };
  }, []);

  return status;
}
