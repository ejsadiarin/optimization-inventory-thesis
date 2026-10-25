import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createLumberRequirement,
  createStructuralMember,
  deleteLumberRequirement,
  deleteStructuralMember,
  groupLumberRequirementsByCrossSection,
  listLumberRequirements,
  listStructuralMembers,
  updateLumberRequirement,
  updateStructuralMember,
} from './members';
import { createProject } from './projects';
import type { ProjectOwner } from './types';
import {
  clearAuth,
  clearFirestore,
  flushPendingWrites,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

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

async function createTestProject(name = 'Test Site'): Promise<string> {
  const created = await createProject({ name }, owner);
  return created.project.id;
}

async function waitForNextTimestamp(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('structural members on Firestore', () => {
  it('creates members in the project subcollection and lists them oldest first', async () => {
    const projectId = await createTestProject('Members Site');
    const otherProjectId = await createTestProject('Other Site');

    const column = await createStructuralMember({
      projectId,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    await waitForNextTimestamp();
    const beam = await createStructuralMember({
      projectId,
      type: 'beam',
      label: 'B1',
      length: 4,
      width: 0.25,
      height: 0.5,
    });
    await createStructuralMember({
      projectId: otherProjectId,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });

    const members = await listStructuralMembers(projectId);

    expect(members.map((member) => member.id)).toEqual([column.id, beam.id]);
    expect(members[0]).toMatchObject({
      projectId,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    expect(members[0]?.createdAt).toEqual(expect.any(String));
    await expect(listStructuralMembers(otherProjectId)).resolves.toHaveLength(1);
  });

  it('normalizes the label and slab height on create', async () => {
    const projectId = await createTestProject();

    const member = await createStructuralMember({
      projectId,
      type: 'slab',
      label: '  Slab 1  ',
      length: 4.2,
      width: 3.1,
      height: 2.8,
    });

    expect(member).toMatchObject({ label: 'Slab 1', height: 0 });
    await expect(listStructuralMembers(projectId)).resolves.toEqual([member]);
  });

  it('updates a member, normalizes fields, and refetches it', async () => {
    const projectId = await createTestProject();
    const member = await createStructuralMember({
      projectId,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });

    const updated = await updateStructuralMember(projectId, member.id, {
      type: 'slab',
      label: '  S1  ',
      length: 4.2,
      width: 3.1,
      height: 2.8,
    });

    expect(updated).toMatchObject({
      id: member.id,
      projectId,
      type: 'slab',
      label: 'S1',
      length: 4.2,
      width: 3.1,
      height: 0,
    });
    await expect(listStructuralMembers(projectId)).resolves.toEqual([updated]);
  });

  it('does not update a member through the wrong project or when it is missing', async () => {
    const projectId = await createTestProject('Members Site');
    const otherProjectId = await createTestProject('Other Site');
    const member = await createStructuralMember({
      projectId,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });

    await expect(
      updateStructuralMember(otherProjectId, member.id, {
        type: 'beam',
        label: 'B1',
        length: 4,
        width: 0.25,
        height: 0.5,
      }),
    ).resolves.toBeUndefined();
    await expect(
      updateStructuralMember(projectId, 'missing-member', {
        type: 'beam',
        label: 'B1',
        length: 4,
        width: 0.25,
        height: 0.5,
      }),
    ).resolves.toBeUndefined();
    await expect(listStructuralMembers(projectId)).resolves.toEqual([member]);
  });

  it('requires a project id for member reads and writes', async () => {
    await expect(listStructuralMembers('')).rejects.toThrow(/project id is required/i);
    await expect(
      createStructuralMember({
        projectId: '',
        type: 'column',
        label: 'C1',
        length: 0.4,
        width: 0.25,
        height: 3,
      }),
    ).rejects.toThrow(/project id is required/i);
    await expect(
      updateStructuralMember('', 'member-1', {
        type: 'column',
        label: 'C1',
        length: 0.4,
        width: 0.25,
        height: 3,
      }),
    ).rejects.toThrow(/project id is required/i);
    await expect(deleteStructuralMember('', 'member-1')).rejects.toThrow(
      /project id is required/i,
    );
  });

  it('deletes only the member in the scoped project', async () => {
    const projectId = await createTestProject();
    const otherProjectId = await createTestProject('Other Site');
    const first = await createStructuralMember({
      projectId,
      type: 'beam',
      label: 'B1',
      length: 4,
      width: 0.25,
      height: 0.5,
    });
    await waitForNextTimestamp();
    const second = await createStructuralMember({
      projectId,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });

    await deleteStructuralMember(otherProjectId, first.id);
    await expect(listStructuralMembers(projectId)).resolves.toHaveLength(2);

    await deleteStructuralMember(projectId, first.id);
    await expect(listStructuralMembers(projectId)).resolves.toEqual([second]);
  });
});

describe('lumber requirements on Firestore', () => {
  it('creates requirements in the project subcollection and lists them oldest first', async () => {
    const projectId = await createTestProject('Lumber Site');
    const otherProjectId = await createTestProject('Other Site');

    const first = await createLumberRequirement({
      projectId,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x3',
    });
    await waitForNextTimestamp();
    const second = await createLumberRequirement({
      projectId,
      label: 'Brace 2',
      length: 3,
      crossSection: '2x2',
    });
    await createLumberRequirement({
      projectId: otherProjectId,
      label: 'Other',
      length: 3,
      crossSection: '2x2',
    });

    const requirements = await listLumberRequirements(projectId);

    expect(requirements.map((requirement) => requirement.id)).toEqual([
      first.id,
      second.id,
    ]);
    await expect(listLumberRequirements(otherProjectId)).resolves.toHaveLength(1);
  });

  it('updates a requirement with a trimmed label and refetches it', async () => {
    const projectId = await createTestProject();
    const created = await createLumberRequirement({
      projectId,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x3',
    });

    const updated = await updateLumberRequirement(projectId, created.id, {
      label: '  Brace A  ',
      length: 2.7,
      crossSection: '2x4',
    });

    expect(updated).toMatchObject({
      id: created.id,
      projectId,
      label: 'Brace A',
      length: 2.7,
      crossSection: '2x4',
    });
    await expect(listLumberRequirements(projectId)).resolves.toEqual([updated]);
  });

  it('does not update a requirement through the wrong project or when it is missing', async () => {
    const projectId = await createTestProject('Lumber Site');
    const otherProjectId = await createTestProject('Other Site');
    const created = await createLumberRequirement({
      projectId,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x3',
    });

    await expect(
      updateLumberRequirement(otherProjectId, created.id, {
        label: 'Other',
        length: 3,
        crossSection: '2x2',
      }),
    ).resolves.toBeUndefined();
    await expect(
      updateLumberRequirement(projectId, 'missing-requirement', {
        label: 'Other',
        length: 3,
        crossSection: '2x2',
      }),
    ).resolves.toBeUndefined();
    await expect(listLumberRequirements(projectId)).resolves.toEqual([created]);
  });

  it('requires a project id for requirement reads and writes', async () => {
    await expect(listLumberRequirements('')).rejects.toThrow(
      /project id is required/i,
    );
    await expect(
      createLumberRequirement({
        projectId: '',
        label: 'Brace',
        length: 2.4,
        crossSection: '2x3',
      }),
    ).rejects.toThrow(/project id is required/i);
    await expect(
      updateLumberRequirement('', 'requirement-1', {
        label: 'Brace',
        length: 2.4,
        crossSection: '2x3',
      }),
    ).rejects.toThrow(/project id is required/i);
    await expect(deleteLumberRequirement('', 'requirement-1')).rejects.toThrow(
      /project id is required/i,
    );
  });

  it('deletes only the requirement in the scoped project', async () => {
    const projectId = await createTestProject();
    const otherProjectId = await createTestProject('Other Site');
    const created = await createLumberRequirement({
      projectId,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x3',
    });

    await deleteLumberRequirement(otherProjectId, created.id);
    await expect(listLumberRequirements(projectId)).resolves.toEqual([created]);

    await deleteLumberRequirement(projectId, created.id);
    await expect(listLumberRequirements(projectId)).resolves.toEqual([]);
  });

  it('groups requirements by cross-section in canonical order', async () => {
    const projectId = await createTestProject();
    const first = await createLumberRequirement({
      projectId,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x4',
    });
    const second = await createLumberRequirement({
      projectId,
      label: 'Brace 2',
      length: 3,
      crossSection: '2x2',
    });
    const third = await createLumberRequirement({
      projectId,
      label: 'Brace 3',
      length: 2.4,
      crossSection: '2x4',
    });

    const groups = groupLumberRequirementsByCrossSection(
      await listLumberRequirements(projectId),
    );

    expect(groups.map((group) => group.crossSection)).toEqual(['2x2', '2x4']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([second.id]);
    expect(new Set(groups[1]?.items.map((item) => item.id))).toEqual(
      new Set([first.id, third.id]),
    );
  });
});
