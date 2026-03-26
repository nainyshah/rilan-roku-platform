import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { useRetryStatus } from '@/hooks/useRetryStatus';

/**
 * ReconnectToast
 *
 * A fixed bottom-center overlay that shows three states:
 *   • Retrying  — amber spinner with attempt counter
 *   • Recovered — green checkmark, auto-dismisses after 3 s
 *   • Failed    — red wifi-off icon (the GlobalErrorBoundary handles the full-screen fallback)
 *
 * Mount this once near the root of the app (inside ThemeProvider).
 * It reads from the global retry event bus via useRetryStatus.
 */
export function ReconnectToast() {
  const status = useRetryStatus();
  const visible = status.state !== 'idle';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="reconnect-toast"
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              'flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl',
              'border backdrop-blur-sm text-sm font-medium',
              status.state === 'retrying'
                ? 'bg-amber-950/90 border-amber-700/60 text-amber-200'
                : status.state === 'recovered'
                ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-200'
                : 'bg-red-950/90 border-red-700/60 text-red-200',
            ].join(' ')}
          >
            {status.state === 'retrying' && (
              <>
                <Loader2 size={16} className="animate-spin shrink-0 text-amber-400" />
                <span>
                  Reconnecting
                  {status.attempt > 1 ? ` (attempt ${status.attempt} of 3)` : '…'}
                </span>
              </>
            )}

            {status.state === 'recovered' && (
              <>
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                <span>Connection restored</span>
              </>
            )}

            {status.state === 'failed' && (
              <>
                <WifiOff size={16} className="shrink-0 text-red-400" />
                <span>Unable to reach server</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
