import { useEffect, useState } from 'react';

const REFRESH_EVENT = 'app:refresh';

export function triggerRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

export function useRefreshSignal(): number {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    function refresh() {
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
