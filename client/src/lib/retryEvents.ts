/**
 * retryEvents.ts
 *
 * A tiny typed event bus that lets code outside the React tree (main.tsx)
 * communicate retry state changes to components inside the tree.
 *
 * Usage:
 *   // Emit from main.tsx query-cache subscriber:
 *   retryEvents.emit({ type: 'retrying', attempt: 2 });
 *   retryEvents.emit({ type: 'recovered' });
 *   retryEvents.emit({ type: 'failed' });
 *
 *   // Subscribe from a React hook:
 *   useEffect(() => retryEvents.subscribe(handler), []);
 */

export type RetryEvent =
  | { type: 'retrying'; attempt: number }   // a retry is in progress
  | { type: 'recovered' }                   // request succeeded after retrying
  | { type: 'failed' };                     // all retries exhausted

type Listener = (event: RetryEvent) => void;

const listeners = new Set<Listener>();

export const retryEvents = {
  emit(event: RetryEvent) {
    listeners.forEach((fn) => fn(event));
  },
  /** Returns an unsubscribe function — use as useEffect cleanup */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
