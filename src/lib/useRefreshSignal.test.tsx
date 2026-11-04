import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerRefresh, useRefreshSignal } from './useRefreshSignal';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

describe('useRefreshSignal', () => {
  it('coalesces refresh events that arrive together', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { result } = renderHook(() => useRefreshSignal());
    expect(result.current).toBe(0);

    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      triggerRefresh();
    });
    expect(result.current).toBe(1);
  });

  it('increments again after the cooldown', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { result } = renderHook(() => useRefreshSignal());

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(1);

    now.mockReturnValue(1_000_800);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(2);
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
