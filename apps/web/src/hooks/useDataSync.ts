import { useEffect, useRef } from 'react';

/**
 * Custom hook to keep UI synchronized across tabs and background actions.
 * - Primary real-time synchronization is driven instantaneously via WebSockets ('app:sync_data').
 * - Re-syncs immediately on window focus and document visibility change.
 * - Listens for 'app:sync_data' custom events broadcasted on user mutations and incoming server events.
 * - Performs a quiet background heartbeat at the specified interval (default 25s) as a resilient fallback.
 */
export function useDataSync(
  onSync: () => void | Promise<void>,
  intervalMs: number = 25000,
  enabled: boolean = true,
) {
  const syncRef = useRef(onSync);
  syncRef.current = onSync;

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncRef.current();
      }
    };

    const handleFocus = () => {
      syncRef.current();
    };

    const handleAppSync = () => {
      syncRef.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app:sync_data', handleAppSync);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncRef.current();
      }
    }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app:sync_data', handleAppSync);
      clearInterval(interval);
    };
  }, [intervalMs, enabled]);
}

/**
 * Dispatch an app-wide data sync event to update all active views without page reload.
 */
export function triggerAppSync() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app:sync_data'));
  }
}
