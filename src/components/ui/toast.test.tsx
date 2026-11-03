import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './toast';

function ToastTrigger() {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast({ title: 'Saved', description: 'Inventory updated.', duration: 4000 })
      }
    >
      Show toast
    </button>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toasts in a polite live region and auto-dismisses them', () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('Saved');
    expect(liveRegion).toHaveTextContent('Inventory updated.');

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('can be dismissed before its timer expires', () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss saved/i }));

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps focus on the trigger when a toast appears and auto-dismisses', () => {
    renderWithProvider();

    const trigger = screen.getByRole('button', { name: 'Show toast' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(trigger).toHaveFocus();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
