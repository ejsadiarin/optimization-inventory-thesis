import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PWAInstallPrompt, { type BeforeInstallPromptEvent } from './PWAInstallPrompt';

function makeInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => undefined);
  const userChoice = Promise.resolve({ outcome, platform: 'web' });

  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', { value: userChoice });
  Object.defineProperty(event, 'platforms', { value: ['web'] });

  return { event, prompt };
}

describe('PWAInstallPrompt', () => {
  it('stays hidden until the browser fires beforeinstallprompt', () => {
    render(<PWAInstallPrompt />);

    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument();
  });

  it('shows an install action, prevents the default prompt, and requests installation', async () => {
    const user = userEvent.setup();
    render(<PWAInstallPrompt />);
    const { event, prompt } = makeInstallEvent('accepted');

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    const installButton = await screen.findByRole('button', { name: /^install$/i });
    expect(screen.getByRole('region', { name: /install app/i })).toBeInTheDocument();

    await user.click(installButton);

    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument();
    });
  });

  it('hides after the user dismisses the browser choice', async () => {
    const user = userEvent.setup();
    render(<PWAInstallPrompt />);
    const { event } = makeInstallEvent('dismissed');

    act(() => {
      window.dispatchEvent(event);
    });
    await user.click(await screen.findByRole('button', { name: /^install$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument();
    });
  });

  it('hides when the app becomes installed', async () => {
    render(<PWAInstallPrompt />);
    const { event } = makeInstallEvent();

    act(() => {
      window.dispatchEvent(event);
    });
    expect(await screen.findByRole('button', { name: /^install$/i })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument();
    });
  });

  it('can be dismissed by the user', async () => {
    const user = userEvent.setup();
    render(<PWAInstallPrompt />);
    const { event } = makeInstallEvent();

    act(() => {
      window.dispatchEvent(event);
    });
    await user.click(await screen.findByRole('button', { name: /dismiss install prompt/i }));

    expect(screen.queryByRole('region', { name: /install app/i })).not.toBeInTheDocument();
  });
});
