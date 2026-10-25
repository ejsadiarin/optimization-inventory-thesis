import { useEffect, useState } from 'react';

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
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return signal;
}
