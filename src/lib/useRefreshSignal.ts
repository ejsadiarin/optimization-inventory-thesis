import { useEffect, useRef, useState } from 'react';

const REFRESH_EVENT = 'app:refresh';
const REFRESH_COOLDOWN_MS = 750;

export function triggerRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

export function useRefreshSignal(): number {
  const [signal, setSignal] = useState(0);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    function refresh() {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
      lastRefreshRef.current = now;
      setSignal((current) => current + 1);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh();
    }

    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener(REFRESH_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener(REFRESH_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return signal;
}
