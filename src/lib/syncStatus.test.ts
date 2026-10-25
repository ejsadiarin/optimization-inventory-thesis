import { afterEach, describe, expect, it, vi } from 'vitest';

const originalOnLine = navigator.onLine;

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadStore() {
  return import('./syncStatus');
}

afterEach(() => {
  setOnline(originalOnLine);
  vi.resetModules();
});

describe('syncStatus store', () => {
  it('marks a tracked write as syncing while pending and synced with a timestamp after it settles', async () => {
    const { trackWrite, getSnapshot, getStatus } = await loadStore();
    const write = deferred<string>();

    const tracked = trackWrite(write.promise);

    expect(getSnapshot()).toMatchObject({ status: 'syncing', pending: 1, lastSyncedAt: null });

    write.resolve('saved');
    await expect(tracked).resolves.toBe('saved');

    const snapshot = getSnapshot();
    expect(snapshot.status).toBe('synced');
    expect(snapshot.pending).toBe(0);
    expect(snapshot.lastSyncedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(snapshot.lastSyncedAt ?? ''))).toBe(false);
    expect(getStatus()).toBe('synced');
  });

  it('reports an error when a tracked write rejects', async () => {
    const { trackWrite, getSnapshot } = await loadStore();

    const tracked = trackWrite(Promise.reject(new Error('write failed')));

    await expect(tracked).rejects.toThrow('write failed');
    expect(getSnapshot()).toMatchObject({ status: 'error', pending: 0 });
  });

  it('keeps the visible status offline while a write is queued', async () => {
    setOnline(false);
    const { trackWrite, getSnapshot } = await loadStore();
    const write = deferred<string>();

    const tracked = trackWrite(write.promise);

    expect(getSnapshot()).toMatchObject({ status: 'offline', pending: 1 });

    write.resolve('queued');
    await expect(tracked).resolves.toBe('queued');
    expect(getSnapshot()).toMatchObject({ status: 'offline', pending: 0 });
  });

  it('counts multiple pending writes and only marks synced when the last one settles', async () => {
    const { trackWrite, getSnapshot } = await loadStore();
    const first = deferred<string>();
    const second = deferred<string>();

    const firstTracked = trackWrite(first.promise);
    const secondTracked = trackWrite(second.promise);

    expect(getSnapshot()).toMatchObject({ status: 'syncing', pending: 2 });

    first.resolve('first');
    await expect(firstTracked).resolves.toBe('first');
    expect(getSnapshot()).toMatchObject({ status: 'syncing', pending: 1 });

    second.resolve('second');
    await expect(secondTracked).resolves.toBe('second');
    expect(getSnapshot()).toMatchObject({ status: 'synced', pending: 0 });
    expect(getSnapshot().lastSyncedAt).not.toBeNull();
  });
});
