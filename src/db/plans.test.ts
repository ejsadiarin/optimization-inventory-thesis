import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  filterCuttingPlanSnapshot,
  getLatestCuttingPlan,
  saveCuttingPlanSnapshot,
} from './plans';
import { createProject } from './projects';
import type { CuttingPlanSnapshot } from './plans';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function snapshot(overrides: Partial<CuttingPlanSnapshot> = {}): CuttingPlanSnapshot {
  return {
    satisfiedRequirementIds: ['req-1'],
    acceptedByRequirement: { 'req-1': 'piece-1' },
    ...overrides,
  };
}

describe('cutting plan snapshots', () => {
  it('returns null when a project has no saved plan', async () => {
    const project = await createProject({ name: 'Empty Site' });

    await expect(getLatestCuttingPlan(project.id)).resolves.toBeNull();
  });

  it('saves and restores the latest acceptance snapshot per project', async () => {
    const project = await createProject({ name: 'Snapshot Site' });
    const other = await createProject({ name: 'Other Site' });
    const first = snapshot();
    const second = snapshot({
      satisfiedRequirementIds: ['req-2'],
      acceptedByRequirement: { 'req-2': 'piece-2' },
    });

    await saveCuttingPlanSnapshot(project.id, first, '2026-10-20T01:00:00.000Z');
    await saveCuttingPlanSnapshot(project.id, second, '2026-10-20T02:00:00.000Z');
    await saveCuttingPlanSnapshot(other.id, first, '2026-10-20T03:00:00.000Z');

    await expect(getLatestCuttingPlan(project.id)).resolves.toMatchObject({
      projectId: project.id,
      createdAt: '2026-10-20T02:00:00.000Z',
      snapshot: second,
    });
    await expect(getLatestCuttingPlan(other.id)).resolves.toMatchObject({
      snapshot: first,
    });
  });

  it('filters stale requirement ids out of a restored snapshot', () => {
    const filtered = filterCuttingPlanSnapshot(
      snapshot({
        satisfiedRequirementIds: ['req-1', 'removed'],
        acceptedByRequirement: { 'req-1': 'piece-1', removed: 'piece-9' },
      }),
      new Set(['req-1', 'req-2']),
    );

    expect(filtered).toEqual({
      satisfiedRequirementIds: ['req-1'],
      acceptedByRequirement: { 'req-1': 'piece-1' },
    });
  });
});
