import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('announces the error and retries when asked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load inventory." onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load inventory.');

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry action when no handler is provided', () => {
    render(<ErrorState message="Something failed." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something failed.');
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
