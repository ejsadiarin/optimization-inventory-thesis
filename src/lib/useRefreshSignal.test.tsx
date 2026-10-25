import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { triggerRefresh, useRefreshSignal } from './useRefreshSignal';

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('useRefreshSignal', () => {
  it('increments on window focus, reconnect, and a visible tab change', () => {
    const { result } = renderHook(() => useRefreshSignal());
    expect(result.current).toBe(0);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(1);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(2);

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(3);

    act(() => {
      triggerRefresh();
    });
    expect(result.current).toBe(4);
  });

  it('ignores a tab change while the document is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    const { result } = renderHook(() => useRefreshSignal());

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(0);
  });
});
