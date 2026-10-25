import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  disableNetwork,
  enableNetwork,
  getDoc,
  getDocFromServer,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  DEFAULT_COSTS,
  DEFAULT_STOCK,
  createProject,
  getProject,
  listProjects,
  updateProjectSettings,
  verifyProjectAccess,
} from './projects';
import type { ProjectOwner } from './types';
import { hashAccessCode } from '@/lib/access-code';
import { projectRef } from '@/lib/firestore-helpers';
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

async function waitForNextTimestamp(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('projects on Firestore', () => {
  it('creates a project with a six-letter code, owner fields, and defaults', async () => {
    const created = await createProject({ name: '  Two-Storey Residence  ' }, owner);

    expect(created.accessCode).toMatch(/^[A-Z]{6}$/);
    expect(created.project).toMatchObject({
      name: 'Two-Storey Residence',
      ownerId: owner.uid,
      ownerName: owner.name,
      schemaVersion: 1,
      costs: DEFAULT_COSTS,
      stock: DEFAULT_STOCK,
    });
    expect(created.project.id).toBeTruthy();
  });

  it('stores only a salted hash and salt, never the plaintext access code', async () => {
    const created = await createProject({ name: 'Hashed Site' }, owner);
    const snapshot = await getDoc(projectRef(created.project.id));
    const raw = snapshot.data();

    expect(raw).toBeDefined();
    if (!raw) throw new Error('Created project document is missing.');
    expect(raw).not.toHaveProperty('accessCode');
    expect(raw.accessCodeHash).toBe(
      await hashAccessCode(created.accessCode, raw.accessCodeSalt as string),
    );
    expect(raw.accessCodeSalt).toMatch(/^[0-9a-f]{32}$/);

    const project = await getProject(created.project.id);
    expect(project).not.toHaveProperty('accessCode');
    expect(project).not.toHaveProperty('accessCodeHash');
    expect(project).not.toHaveProperty('accessCodeSalt');
  });

  it('lists projects newest first and finds each document by id', async () => {
    const first = await createProject({ name: 'First Site' }, owner);
    await waitForNextTimestamp();
    const second = await createProject({ name: 'Second Site' }, owner);

    const projects = await listProjects();

    expect(projects.map((project) => project.id)).toEqual([
      second.project.id,
      first.project.id,
    ]);
    await expect(getProject(first.project.id)).resolves.toMatchObject({ name: 'First Site' });
    await expect(getProject('missing-project')).resolves.toBeUndefined();
  });

  it('verifies the access code after normalization and rejects a missing project', async () => {
    const created = await createProject({ name: 'Gated Site' }, owner);

    await expect(
      verifyProjectAccess(created.project.id, created.accessCode),
    ).resolves.toBe(true);
    await expect(
      verifyProjectAccess(created.project.id, created.accessCode.toLowerCase()),
    ).resolves.toBe(true);
    await expect(
      verifyProjectAccess(created.project.id, ` ${created.accessCode} `),
    ).resolves.toBe(true);
    await expect(verifyProjectAccess(created.project.id, 'WRONG1')).resolves.toBe(false);
    await expect(verifyProjectAccess('missing-project', created.accessCode)).resolves.toBe(false);
  });

  it('updates settings in Firestore and returns the refreshed project', async () => {
    const created = await createProject({ name: 'Settings Site' }, owner);

    const updated = await updateProjectSettings(created.project.id, {
      costs: { phenolicPerSheet: 920, lumberPerPiece: 145 },
      stock: { phenolic: { length: 2.5, width: 1.25 }, lumberLengths: [3.0, 4.5] },
    });

    expect(updated?.costs).toEqual({ phenolicPerSheet: 920, lumberPerPiece: 145 });
    expect(updated?.stock).toEqual({
      phenolic: { length: 2.5, width: 1.25 },
      lumberLengths: [3.0, 4.5],
    });

    await expect(getProject(created.project.id)).resolves.toMatchObject({
      costs: { phenolicPerSheet: 920, lumberPerPiece: 145 },
    });
  });

  it('creates a project offline and persists it after reconnecting', async () => {
    const firestore = requireDb();
    await disableNetwork(firestore);

    let created;
    try {
      created = await createProject({ name: 'Offline Site' }, owner);
      expect(created.project).toMatchObject({ name: 'Offline Site', ownerId: owner.uid });
      await expect(getProject(created.project.id)).resolves.toMatchObject({
        name: 'Offline Site',
      });
    } finally {
      await enableNetwork(firestore);
    }

    await waitForPendingWrites(firestore);
    const persisted = await getDocFromServer(projectRef(created.project.id));
    expect(persisted.exists()).toBe(true);
    expect(persisted.data()).toMatchObject({ name: 'Offline Site' });
  });

  it('returns undefined when updating a project that does not exist', async () => {
    await expect(
      updateProjectSettings('missing-project', {
        costs: DEFAULT_COSTS,
        stock: DEFAULT_STOCK,
      }),
    ).resolves.toBeUndefined();
  });
});
