import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  disableNetwork,
  enableNetwork,
  setDoc,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { projectDoc } from '@/lib/firestore-helpers';
import { getLatestCuttingPlan, saveCuttingPlanSnapshot } from './plans';
import { createProject } from './projects';
import type { CuttingPlanRecord, ProjectOwner } from './types';
import type { CuttingPlanSnapshot } from './plans';
import {
  clearAuth,
  clearFirestore,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

beforeAll(async () => {
  await clearAuth();
  await clearFirestore();
  const uid = await signInDemoUser();
  owner = { uid, name: 'Demo Engineer' };
});

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await signOutDemoUser();
});

async function createTestProject(name = 'Plan Site'): Promise<string> {
  const created = await createProject({ name }, owner);
  return created.project.id;
}

function snapshot(overrides: Partial<CuttingPlanSnapshot> = {}): CuttingPlanSnapshot {
  return {
    satisfiedRequirementIds: ['req-1'],
    acceptedByRequirement: { 'req-1': 'piece-1' },
    ...overrides,
  };
}

describe('cutting plans on Firestore', () => {
  it('returns null when a project has no saved plan', async () => {
    const projectId = await createTestProject('Empty Site');

    await expect(getLatestCuttingPlan(projectId)).resolves.toBeNull();
  });

  it('saves a plan to the project subcollection and restores it', async () => {
    const projectId = await createTestProject('Saved Site');
    const saved = snapshot();

    const record = await saveCuttingPlanSnapshot(
      projectId,
      saved,
      '2026-10-20T01:00:00.000Z',
    );
    await waitForPendingWrites(requireDb());

    expect(record).toMatchObject({
      projectId,
      createdAt: '2026-10-20T01:00:00.000Z',
      payload: saved,
    });
    await expect(getLatestCuttingPlan(projectId)).resolves.toEqual({
      id: record.id,
      projectId,
      createdAt: '2026-10-20T01:00:00.000Z',
      snapshot: saved,
    });
  });

  it('returns the newest plan by createdAt', async () => {
    const projectId = await createTestProject('Latest Site');
    const first = snapshot();
    const second = snapshot({
      satisfiedRequirementIds: ['req-2'],
      acceptedByRequirement: { 'req-2': 'piece-2' },
    });

    await saveCuttingPlanSnapshot(projectId, first, '2026-10-20T01:00:00.000Z');
    await saveCuttingPlanSnapshot(projectId, second, '2026-10-20T02:00:00.000Z');
    await waitForPendingWrites(requireDb());

    await expect(getLatestCuttingPlan(projectId)).resolves.toMatchObject({
      projectId,
      createdAt: '2026-10-20T02:00:00.000Z',
      snapshot: second,
    });
  });

  it('scopes plans to their project', async () => {
    const projectId = await createTestProject('Scoped Site');
    const otherProjectId = await createTestProject('Other Site');
    const scoped = snapshot();
    const other = snapshot({
      satisfiedRequirementIds: ['req-9'],
      acceptedByRequirement: { 'req-9': 'piece-9' },
    });

    await saveCuttingPlanSnapshot(projectId, scoped, '2026-10-20T01:00:00.000Z');
    await saveCuttingPlanSnapshot(otherProjectId, other, '2026-10-20T02:00:00.000Z');
    await waitForPendingWrites(requireDb());

    await expect(getLatestCuttingPlan(projectId)).resolves.toMatchObject({
      projectId,
      snapshot: scoped,
    });
    await expect(getLatestCuttingPlan(otherProjectId)).resolves.toMatchObject({
      projectId: otherProjectId,
      snapshot: other,
    });
  });

  it('returns null when the newest payload is invalid', async () => {
    const projectId = await createTestProject('Invalid Site');
    await setDoc(projectDoc(projectId, 'cuttingPlans', 'invalid-plan'), {
      id: 'invalid-plan',
      projectId,
      createdAt: '2026-10-20T01:00:00.000Z',
      payload: { satisfiedRequirementIds: 'not-an-array' },
    });
    await waitForPendingWrites(requireDb());

    await expect(getLatestCuttingPlan(projectId)).resolves.toBeNull();
  });

  it('queues a save made offline and applies it after reconnect', async () => {
    const projectId = await createTestProject('Offline Site');
    const saved = snapshot();

    const firestore = requireDb();
    await disableNetwork(firestore);
    let record: CuttingPlanRecord;
    try {
      record = await saveCuttingPlanSnapshot(
        projectId,
        saved,
        '2026-10-20T01:00:00.000Z',
      );
      expect(record.id).toEqual(expect.any(String));
    } finally {
      await enableNetwork(firestore);
    }

    await waitForPendingWrites(firestore);

    await expect(getLatestCuttingPlan(projectId)).resolves.toMatchObject({
      id: record.id,
      projectId,
      createdAt: '2026-10-20T01:00:00.000Z',
      snapshot: saved,
    });
  });
});
