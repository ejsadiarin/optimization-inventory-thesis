import { onSnapshotsInSync, waitForPendingWrites } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncStatusSnapshot {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pending: number;
}

type BaseStatus = 'syncing' | 'synced' | 'error';

let pending = 0;
let lastSyncedAt: string | null = null;
let baseStatus: BaseStatus = 'synced';
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let started = false;

const listeners = new Set<() => void>();

function visibleStatus(): SyncStatus {
  if (!online) return 'offline';
  if (baseStatus === 'error') return 'error';
  if (pending > 0 || baseStatus === 'syncing') return 'syncing';
  return 'synced';
}

let snapshot: SyncStatusSnapshot = {
  status: visibleStatus(),
  lastSyncedAt,
  pending,
};

function emit(): void {
  const status = visibleStatus();
  if (
    snapshot.status === status &&
    snapshot.lastSyncedAt === lastSyncedAt &&
    snapshot.pending === pending
  ) {
    return;
  }

  snapshot = { status, lastSyncedAt, pending };
  for (const listener of listeners) listener();
}

async function flushAndMarkSynced(): Promise<void> {
  const firestore = db;
  if (firestore) {
    try {
      await waitForPendingWrites(firestore);
    } catch {
      baseStatus = 'error';
      emit();
      return;
    }
  }

  if (!online || pending > 0) {
    emit();
    return;
  }

  baseStatus = 'synced';
  lastSyncedAt = new Date().toISOString();
  emit();
}

function handleOnline(): void {
  online = true;
  emit();
  if (pending === 0 && baseStatus !== 'error') {
    void flushAndMarkSynced();
  }
}

function handleOffline(): void {
  online = false;
  emit();
}

function handleSnapshotsInSync(): void {
  if (!online || pending > 0 || baseStatus === 'error') return;
  baseStatus = 'synced';
  lastSyncedAt = new Date().toISOString();
  emit();
}

export function startSyncStatus(): void {
  if (started) return;
  started = true;

  if (typeof window !== 'undefined') {
    online = typeof navigator === 'undefined' ? true : navigator.onLine;
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  if (db) {
    onSnapshotsInSync(db, handleSnapshotsInSync);
  }

  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SyncStatusSnapshot {
  return snapshot;
}

export function getStatus(): SyncStatus {
  return snapshot.status;
}

export function trackWrite<T>(promise: Promise<T>): Promise<T> {
  pending += 1;
  if (online) baseStatus = 'syncing';
  emit();

  const tracked = promise.then(
    async (value) => {
      pending -= 1;
      if (online && pending === 0) {
        await flushAndMarkSynced();
      } else {
        emit();
      }
      return value;
    },
    (error: unknown) => {
      pending -= 1;
      baseStatus = 'error';
      emit();
      throw error;
    },
  );

  void tracked.catch(() => undefined);
  return tracked;
}

export function queueWrite(promise: Promise<unknown>): void {
  void trackWrite(promise).catch(() => undefined);
}
