import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SyncStatusChip from './SyncStatusChip';
import type { SyncStatusSnapshot } from '@/lib/syncStatus';

const mocks = vi.hoisted(() => ({
  snapshot: {
    status: 'synced',
    lastSyncedAt: null,
    pending: 0,
  } as SyncStatusSnapshot,
  subscribe: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/syncStatus', () => ({
  subscribe: mocks.subscribe,
  getSnapshot: () => mocks.snapshot,
}));

beforeEach(() => {
  mocks.snapshot = { status: 'synced', lastSyncedAt: null, pending: 0 };
});

function renderChip(snapshot: SyncStatusSnapshot) {
  mocks.snapshot = snapshot;
  return render(<SyncStatusChip />);
}

describe('SyncStatusChip', () => {
  it('shows Offline when the device is offline', () => {
    renderChip({ status: 'offline', lastSyncedAt: null, pending: 2 });

    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });

  it('shows Syncing while writes are pending', () => {
    renderChip({ status: 'syncing', lastSyncedAt: null, pending: 1 });

    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
  });

  it('shows Synced with the last sync time', () => {
    renderChip({
      status: 'synced',
      lastSyncedAt: '2026-10-25T06:32:00.000Z',
      pending: 0,
    });

    expect(screen.getByRole('status')).toHaveTextContent(/^Synced · \d{2}:\d{2}$/);
  });

  it('shows a sync error when a write fails', () => {
    renderChip({ status: 'error', lastSyncedAt: null, pending: 0 });

    expect(screen.getByRole('status')).toHaveTextContent('Sync error');
  });
});
