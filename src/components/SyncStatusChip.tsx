import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type SyncStatus } from '@/lib/syncStatus';

const LABELS: Record<SyncStatus, string> = {
  offline: 'Offline',
  syncing: 'Syncing…',
  synced: 'Synced',
  error: 'Sync error',
};

const CLASSES: Record<SyncStatus, string> = {
  offline: 'bg-muted text-muted-foreground',
  syncing: 'bg-amber-100 text-amber-800',
  synced: 'bg-emerald-100 text-emerald-800',
  error: 'bg-destructive/10 text-destructive',
};

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function SyncStatusChip() {
  const { status, lastSyncedAt } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const label =
    status === 'synced' && lastSyncedAt
      ? `${LABELS.synced} · ${formatTime(lastSyncedAt)}`
      : LABELS[status];

  return (
    <span
      role="status"
      aria-live="polite"
      title={label}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}
    >
      {label}
    </span>
  );
}
