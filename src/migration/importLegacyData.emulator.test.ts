import 'fake-indexeddb/auto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { importLegacyData } from '@/migration/importLegacyData';
import { db as legacyDb } from '@/migration/legacyDb';
import type { LegacyProject } from '@/migration/legacyTypes';
import type { ProjectOwner } from '@/db/types';
import {
  clearAuth,
  clearFirestore,
  flushPendingWrites,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

async function clearLegacy(): Promise<void> {
  await Promise.all(legacyDb.tables.map((table) => table.clear()));
}

beforeAll(async () => {
  await flushPendingWrites();
  await clearAuth();
  await clearFirestore();
  await clearLegacy();
  const uid = await signInDemoUser();
  owner = { uid, name: 'Demo Engineer' };
});

beforeEach(async () => {
  await flushPendingWrites();
  await clearFirestore();
  await clearLegacy();
  storage.clear();
});

afterAll(async () => {
  await flushPendingWrites();
  await signOutDemoUser();
});

describe('importLegacyData', () => {
  it('imports a legacy project and all child records into Firestore', async () => {
    const legacyProject: LegacyProject = {
      id: 'legacy-project-1',
      name: 'Legacy Site',
      accessCode: 'ABCDEF',
      createdAt: '2026-01-01T00:00:00.000Z',
      costs: { phenolicPerSheet: 850, lumberPerPiece: 120 },
      stock: { phenolic: { length: 2.44, width: 1.22 }, lumberLengths: [2.4, 3.0] },
    };
    await legacyDb.projects.add(legacyProject);
    await legacyDb.structuralMembers.add({
      id: 'member-1',
      projectId: legacyProject.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await legacyDb.lumberRequirements.add({
      id: 'req-1',
      projectId: legacyProject.id,
      label: 'L1',
      length: 2.4,
      crossSection: '2x4',
      createdAt: '2026-01-03T00:00:00.000Z',
    });
    await legacyDb.pieces.add({
      id: 'piece-1',
      projectId: legacyProject.id,
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      condition: 'Good',
      usageCount: 0,
      storageLocation: 'Rack A',
      dateAdded: '2026-01-04T00:00:00.000Z',
      retired: false,
      source: 'manual',
    });
    await legacyDb.usageLog.add({
      id: 'usage-1',
      pieceId: 'piece-1',
      projectId: legacyProject.id,
      structuralMemberLabel: 'C1',
      date: '2026-01-05T00:00:00.000Z',
      createdAt: '2026-01-05T00:00:00.000Z',
    });
    await legacyDb.cuttingPlans.add({
      id: 'plan-1',
      projectId: legacyProject.id,
      createdAt: '2026-01-06T00:00:00.000Z',
      payload: {
        satisfiedRequirementIds: ['req-1'],
        acceptedByRequirement: { 'req-1': 'piece-1' },
      },
    });

    const count = await importLegacyData(owner);
    expect(count).toBe(1);

    const projectSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectRef(legacyProject.id),
    );
    expect(projectSnap.exists()).toBe(true);
    const projectData = projectSnap.data() as Record<string, unknown>;
    expect(projectData.ownerId).toBe(owner.uid);
    expect(projectData.ownerName).toBe(owner.name);
    expect(projectData.schemaVersion).toBe(1);
    expect(projectData.name).toBe('Legacy Site');
    expect(projectData.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(typeof projectData.accessCodeHash).toBe('string');
    expect(typeof projectData.accessCodeSalt).toBe('string');
    // verify hash matches
    const { hashAccessCode } = await import('@/lib/access-code');
    const expectedHash = await hashAccessCode('ABCDEF', projectData.accessCodeSalt as string);
    expect(projectData.accessCodeHash).toBe(expectedHash);

    const memberSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectDoc(
        legacyProject.id,
        'structuralMembers',
        'member-1',
      ),
    );
    expect(memberSnap.exists()).toBe(true);

    const reqSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectDoc(legacyProject.id, 'lumberRequirements', 'req-1'),
    );
    expect(reqSnap.exists()).toBe(true);

    const pieceSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectDoc(legacyProject.id, 'pieces', 'piece-1'),
    );
    expect(pieceSnap.exists()).toBe(true);

    const usageSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectDoc(legacyProject.id, 'usageLog', 'usage-1'),
    );
    expect(usageSnap.exists()).toBe(true);

    const planSnap = await getDoc(
      (await import('@/lib/firestore-helpers')).projectDoc(legacyProject.id, 'cuttingPlans', 'plan-1'),
    );
    expect(planSnap.exists()).toBe(true);
    expect((planSnap.data() as Record<string, unknown>).payload).toEqual({
      satisfiedRequirementIds: ['req-1'],
      acceptedByRequirement: { 'req-1': 'piece-1' },
    });

    expect(globalThis.localStorage.getItem('formwork.firestore-migration.v1')).toBe('done');
  });

  it('sets the flag and returns 0 when there is no legacy data', async () => {
    const count = await importLegacyData(owner);
    expect(count).toBe(0);
    expect(globalThis.localStorage.getItem('formwork.firestore-migration.v1')).toBe('done');
  });

  it('is idempotent: a second run is a no-op because the flag is set', async () => {
    const count = await importLegacyData(owner);
    expect(count).toBe(0);
  });

  it('generates a code and warns when legacy project has no access code', async () => {
    storage.clear();
    const legacyProject: LegacyProject = {
      id: 'legacy-project-2',
      name: 'No Code Site',
      accessCode: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      costs: { phenolicPerSheet: 850, lumberPerPiece: 120 },
      stock: { phenolic: { length: 2.44, width: 1.22 }, lumberLengths: [2.4] },
    };
    await legacyDb.projects.add(legacyProject);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = await importLegacyData(owner);
    expect(count).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('leaves the flag unset and local data intact when a write fails, then retries', async () => {
    storage.clear();
    await clearFirestore();
    await clearLegacy();
    const legacyProject: LegacyProject = {
      id: 'legacy-project-3',
      name: 'Fail Site',
      accessCode: 'ABCDEF',
      createdAt: '2026-01-01T00:00:00.000Z',
      costs: { phenolicPerSheet: 850, lumberPerPiece: 120 },
      stock: { phenolic: { length: 2.44, width: 1.22 }, lumberLengths: [2.4] },
    };
    await legacyDb.projects.add(legacyProject);

    await signOutDemoUser();
    await expect(importLegacyData(owner)).rejects.toBeTruthy();
    expect(globalThis.localStorage.getItem('formwork.firestore-migration.v1')).not.toBe('done');
    const remaining = await legacyDb.projects.count();
    expect(remaining).toBe(1);

    const uid = await signInDemoUser();
    owner = { uid, name: 'Demo Engineer' };
    const count = await importLegacyData(owner);
    expect(count).toBe(1);
    expect(globalThis.localStorage.getItem('formwork.firestore-migration.v1')).toBe('done');
  });
});
