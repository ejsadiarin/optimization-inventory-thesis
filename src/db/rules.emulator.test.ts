import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { flushPendingWrites } from '@/test/emulator';

const PROJECT_ID = 'demo-test';
let testEnv: RulesTestEnvironment;

function projectData(ownerId: string) {
  return {
    id: 'shared-project',
    name: 'Shared Site',
    ownerId,
    ownerName: 'Owner',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    costs: { phenolicPerSheet: 850, lumberPerPiece: 120 },
    stock: { phenolic: { length: 2.44, width: 1.22 }, lumberLengths: [2.4] },
    accessCodeHash: 'hash',
    accessCodeSalt: 'salt',
  };
}

async function seedProject(ownerId = 'owner-a'): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('projects/shared-project').set(projectData(ownerId));
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await flushPendingWrites();
  await testEnv.clearFirestore();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await flushPendingWrites();
  await testEnv.cleanup();
});

describe('Firestore rules for projects', () => {
  it('denies unauthenticated reads and writes', async () => {
    await seedProject();
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(db.doc('projects/shared-project').get());
    await assertFails(db.doc('projects/new-project').set(projectData('owner-a')));
  });

  it('allows any signed-in account to read a project', async () => {
    await seedProject();
    const db = testEnv.authenticatedContext('viewer').firestore();

    await assertSucceeds(db.doc('projects/shared-project').get());
  });

  it('allows creation only when the caller is the owner', async () => {
    const db = testEnv.authenticatedContext('owner-a').firestore();

    await assertSucceeds(db.doc('projects/own-project').set(projectData('owner-a')));
    await assertFails(db.doc('projects/other-project').set(projectData('owner-b')));
  });

  it('prevents reassigning the owner but allows ordinary updates', async () => {
    await seedProject('owner-a');
    const db = testEnv.authenticatedContext('owner-a').firestore();
    const reference = db.doc('projects/shared-project');

    await assertFails(reference.update({ ownerId: 'owner-b' }));
    await assertSucceeds(reference.update({ name: 'Renamed Site' }));
  });

  it('allows any signed-in account to write subcollections', async () => {
    await seedProject();
    const db = testEnv.authenticatedContext('viewer').firestore();

    await assertSucceeds(
      db
        .doc('projects/shared-project/structuralMembers/member-1')
        .set({ id: 'member-1', projectId: 'shared-project', label: 'C1' }),
    );
    await assertSucceeds(
      db.doc('projects/shared-project/structuralMembers/member-1').get(),
    );
  });

  it('does not enforce the access code server-side (deliberate UI-only gate)', async () => {
    await seedProject('owner-a');
    const db = testEnv.authenticatedContext('viewer').firestore();
    const reference = db.doc('projects/shared-project');

    await assertSucceeds(reference.get());
    await assertSucceeds(reference.update({ name: 'Changed without a code' }));
  });
});
