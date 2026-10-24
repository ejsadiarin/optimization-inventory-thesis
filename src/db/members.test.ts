import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
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
import { seedProject } from '@/test/fixtures';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('structural member CRUD', () => {
  it('creates and lists members for a single project', async () => {
    const project = await seedProject({ name: 'Sample Site' });
    const otherProject = await seedProject({ name: 'Other Site' });

    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    await createStructuralMember({
      projectId: otherProject.id,
      type: 'beam',
      label: 'B1',
      length: 4,
      width: 0.25,
      height: 0.5,
    });

    const members = await listStructuralMembers(project.id);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: column.id,
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    expect(members[0]?.createdAt).toEqual(expect.any(String));
  });

  it('updates a member and clears slab height', async () => {
    const project = await seedProject({ name: 'Sample Site' });
    const member = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });

    const updated = await updateStructuralMember(member.id, {
      type: 'slab',
      label: 'S1',
      length: 4.2,
      width: 3.1,
      height: 2.8,
    });

    expect(updated).toMatchObject({
      type: 'slab',
      label: 'S1',
      length: 4.2,
      width: 3.1,
      height: 0,
    });
  });

  it('deletes a member without touching other records', async () => {
    const project = await seedProject({ name: 'Sample Site' });
    const first = await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 4,
      width: 0.25,
      height: 0.5,
    });
    const second = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });

    await deleteStructuralMember(first.id);

    expect(await listStructuralMembers(project.id)).toEqual([second]);
  });
});

describe('lumber requirement CRUD and grouping', () => {
  it('creates, updates, and deletes lumber requirements', async () => {
    const project = await seedProject({ name: 'Sample Site' });
    const created = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x3',
    });

    const updated = await updateLumberRequirement(created.id, {
      label: 'Brace A',
      length: 2.7,
      crossSection: '2x4',
    });

    expect(updated).toMatchObject({
      projectId: project.id,
      label: 'Brace A',
      length: 2.7,
      crossSection: '2x4',
    });

    await deleteLumberRequirement(created.id);
    expect(await listLumberRequirements(project.id)).toEqual([]);
  });

  it('groups requirements by cross-section in canonical order', async () => {
    const project = await seedProject({ name: 'Sample Site' });
    const first = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace 1',
      length: 2.4,
      crossSection: '2x4',
    });
    const second = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace 2',
      length: 3,
      crossSection: '2x2',
    });
    const third = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace 3',
      length: 2.4,
      crossSection: '2x4',
    });

    const groups = groupLumberRequirementsByCrossSection(
      await listLumberRequirements(project.id),
    );

    expect(groups.map((group) => group.crossSection)).toEqual(['2x2', '2x4']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([second.id]);
    expect(new Set(groups[1]?.items.map((item) => item.id))).toEqual(
      new Set([first.id, third.id]),
    );
  });
});
