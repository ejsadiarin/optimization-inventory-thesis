import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createProject } from './projects';
import { emptyWorkflow, getOptimizationWorkflow, saveOptimizationWorkflow } from './workflow';
import type { OptimizationWorkflow } from './workflow';
import type { ProjectOwner } from './types';
import {
  clearAuth,
  clearFirestore,
  flushPendingWrites,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

beforeAll(async () => {
  await flushPendingWrites();
  await clearAuth();
  await clearFirestore();
  const uid = await signInDemoUser();
  owner = { uid, name: 'Demo Engineer' };
});

beforeEach(async () => {
  await flushPendingWrites();
  await clearFirestore();
});

afterAll(async () => {
  await flushPendingWrites();
  await signOutDemoUser();
});

async function createTestProject(name = 'Workflow Site'): Promise<string> {
  const created = await createProject({ name }, owner);
  return created.project.id;
}

function workflow(overrides: Partial<OptimizationWorkflow> = {}): OptimizationWorkflow {
  return {
    ...emptyWorkflow(),
    satisfiedRequirementIds: ['req-1'],
    acceptedByRequirement: { 'req-1': 'piece-1' },
    declinedCandidates: ['req-2::piece-2'],
    step: 'cuts',
    cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('optimization workflow on Firestore', () => {
  it('returns null when a project has no workflow document', async () => {
    const projectId = await createTestProject('Empty Site');

    await expect(getOptimizationWorkflow(projectId)).resolves.toBeNull();
  });

  it('saves the workflow document and restores it', async () => {
    const projectId = await createTestProject('Saved Site');
    const saved = workflow();

    await saveOptimizationWorkflow(projectId, saved);
    await waitForPendingWrites(requireDb());

    await expect(getOptimizationWorkflow(projectId)).resolves.toEqual(saved);
  });

  it('scopes workflows to their project', async () => {
    const projectId = await createTestProject('Scoped Site');
    const otherProjectId = await createTestProject('Other Site');
    const scoped = workflow();
    const other = workflow({
      satisfiedRequirementIds: ['req-9'],
      acceptedByRequirement: { 'req-9': 'piece-9' },
      step: 'reuse',
    });

    await saveOptimizationWorkflow(projectId, scoped);
    await saveOptimizationWorkflow(otherProjectId, other);
    await waitForPendingWrites(requireDb());

    await expect(getOptimizationWorkflow(projectId)).resolves.toEqual(scoped);
    await expect(getOptimizationWorkflow(otherProjectId)).resolves.toEqual(other);
  });

  it('queues an offline save and applies it after reconnect', async () => {
    const projectId = await createTestProject('Offline Site');
    const saved = workflow();

    const firestore = requireDb();
    await disableNetwork(firestore);
    try {
      await saveOptimizationWorkflow(projectId, saved);
    } finally {
      await enableNetwork(firestore);
    }

    await waitForPendingWrites(firestore);

    await expect(getOptimizationWorkflow(projectId)).resolves.toEqual(saved);
  });
});
