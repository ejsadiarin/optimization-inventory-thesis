import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { listPieces } from './inventory';
import { listLumberRequirements, listStructuralMembers } from './members';
import { getLatestCuttingPlan } from './plans';
import { listProjects, verifyProjectAccess } from './projects';
import { DEMO_ACCESS_CODE, DEMO_PROJECT_NAME, seedDemoProject } from './seed';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('seedDemoProject', () => {
  it('creates a usable demo project with members, inventory, usage, and accepted reuse', async () => {
    const project = await seedDemoProject();

    expect(project.name).toBe(DEMO_PROJECT_NAME);
    expect(project.accessCode).toBe(DEMO_ACCESS_CODE);
    await expect(verifyProjectAccess(project.id, DEMO_ACCESS_CODE)).resolves.toBe(true);

    await expect(listStructuralMembers(project.id)).resolves.toHaveLength(6);
    await expect(listLumberRequirements(project.id)).resolves.toHaveLength(5);

    const pieces = await listPieces(project.id);
    expect(pieces).toHaveLength(12);
    expect(pieces.filter((piece) => piece.retired)).toHaveLength(1);
    expect(pieces.filter((piece) => piece.condition === 'For Inspection')).toHaveLength(2);
    expect(pieces.some((piece) => piece.usageCount >= 5)).toBe(true);

    const plan = await getLatestCuttingPlan(project.id);
    expect(plan).not.toBeNull();
    expect(plan?.snapshot.satisfiedRequirementIds).toHaveLength(2);
    expect(Object.keys(plan?.snapshot.acceptedByRequirement ?? {})).toHaveLength(2);
  });

  it('does not create duplicate demo projects', async () => {
    const first = await seedDemoProject();
    const second = await seedDemoProject();

    expect(second.id).toBe(first.id);
    await expect(listProjects()).resolves.toHaveLength(1);
  });
});
