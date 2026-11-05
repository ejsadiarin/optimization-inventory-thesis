import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LumberRequirement, ProjectCosts, ProjectStock, StructuralMember } from '@/db/types';
import type { MatchPiece } from '@/engine/types';
import type { Piece } from '@/db/types';
import { emptyProjectPlan, type ProjectPlan } from '@/db/plan';
import { buildPlannerState, releaseAllocation } from './planner';
import { commitProjectPlan } from './planCommit';

vi.mock('@/db/inventory', () => ({
  recordPlanUsage: vi.fn(),
}));

vi.mock('@/db/plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/plan')>();
  return { ...actual, saveProjectPlan: vi.fn() };
});

const { recordPlanUsage } = await import('@/db/inventory');
const { saveProjectPlan } = await import('@/db/plan');

const recordUsageMock = vi.mocked(recordPlanUsage);
const savePlanMock = vi.mocked(saveProjectPlan);

const stock: ProjectStock = {
  phenolic: { length: 20, width: 10, thickness: 0.1 },
  lumberLengths: [10],
};

const costs: ProjectCosts = {
  phenolicPerSheet: 1,
  lumberPerPiece: 1,
};

function member(id: string, label: string): StructuralMember {
  return {
    id,
    projectId: 'project-1',
    type: 'slab',
    label,
    length: 10,
    width: 10,
    height: 0.1,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

function piece(id: string, overrides: Partial<MatchPiece> = {}): MatchPiece {
  return {
    id,
    materialType: 'phenolic',
    length: 20,
    width: 10,
    condition: 'Good',
    retired: false,
    ...overrides,
  };
}

function plan(overrides: Partial<ProjectPlan> = {}): ProjectPlan {
  return { ...emptyProjectPlan(), ...overrides };
}

function stateFor(
  currentPlan: ProjectPlan,
  members: StructuralMember[],
  pieces: MatchPiece[],
  lumbar: LumberRequirement[] = [],
) {
  return buildPlannerState({
    members,
    lumber: lumbar,
    pieces,
    stock,
    costs,
    plan: currentPlan,
  });
}

beforeEach(() => {
  recordUsageMock.mockReset();
  recordUsageMock.mockResolvedValue({ id: 'piece' } as Piece);
  savePlanMock.mockReset();
  savePlanMock.mockResolvedValue();
});

describe('commitProjectPlan', () => {
  it('refuses to commit when there are no requirements', async () => {
    const state = stateFor(emptyProjectPlan(), [], []);

    await expect(commitProjectPlan('project-1', emptyProjectPlan(), state)).rejects.toThrow(
      /add requirements/i,
    );
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(savePlanMock).not.toHaveBeenCalled();
  });

  it('refuses to commit while a requirement still needs a decision', async () => {
    const state = stateFor(
      emptyProjectPlan(),
      [member('member-a', 'C1')],
      [piece('piece-1')],
    );

    expect(state.counts.needsDecision).toBeGreaterThan(0);
    await expect(commitProjectPlan('project-1', emptyProjectPlan(), state)).rejects.toThrow(
      /decide every requirement/i,
    );
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(savePlanMock).not.toHaveBeenCalled();
  });

  it('records one usage event per newly committed piece and saves a committed plan', async () => {
    const current = plan({
      acceptedByRequirement: {
        'member-a-panel-1': 'piece-1',
        'member-b-panel-1': 'piece-2',
      },
    });
    const state = stateFor(
      current,
      [member('member-a', 'C1'), member('member-b', 'C2')],
      [piece('piece-1'), piece('piece-2')],
    );

    const saved = await commitProjectPlan('project-1', current, state);

    expect(recordUsageMock).toHaveBeenCalledTimes(2);
    expect(recordUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pieceId: 'piece-1',
        projectId: 'project-1',
        structuralMemberLabels: ['C1'],
        requirementIds: ['member-a-panel-1'],
        requirementLabels: ['C1'],
      }),
    );
    expect(saved.status).toBe('committed');
    expect(saved.committedByRequirement).toEqual(current.acceptedByRequirement);
    expect(saved.usageRecordedPieceIds.sort()).toEqual(['piece-1', 'piece-2']);
    expect(saved.requirementSnapshots).toHaveProperty('member-a-panel-1');
    expect(saved.pieceSnapshots).toHaveProperty('piece-1');
    expect(savePlanMock).toHaveBeenCalledWith('project-1', saved);
  });

  it('names every member and requirement served by a shared piece', async () => {
    const current = plan({
      acceptedByRequirement: {
        'member-a-panel-1': 'piece-1',
        'member-b-panel-1': 'piece-1',
      },
    });
    const state = stateFor(
      current,
      [member('member-a', 'C1'), member('member-b', 'C2')],
      [piece('piece-1')],
    );

    await commitProjectPlan('project-1', current, state);

    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pieceId: 'piece-1',
        structuralMemberLabels: ['C1', 'C2'],
        requirementIds: ['member-a-panel-1', 'member-b-panel-1'],
        requirementLabels: ['C1', 'C2'],
      }),
    );
  });

  it('does not record usage again when committing an unchanged plan', async () => {
    const current = plan({
      acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
    });
    const members = [member('member-a', 'C1')];
    const pieces = [piece('piece-1')];
    const first = await commitProjectPlan(
      'project-1',
      current,
      stateFor(current, members, pieces),
    );
    recordUsageMock.mockClear();

    await commitProjectPlan('project-1', first, stateFor(first, members, pieces));

    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(savePlanMock).toHaveBeenCalledTimes(2);
  });

  it('records usage again after release and re-acceptance', async () => {
    const current = plan({
      acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
    });
    const members = [member('member-a', 'C1')];
    const pieces = [piece('piece-1')];
    const first = await commitProjectPlan(
      'project-1',
      current,
      stateFor(current, members, pieces),
    );
    const released = releaseAllocation(first, 'member-a-panel-1');
    expect(released.usageRecordedPieceIds).toEqual([]);

    recordUsageMock.mockClear();
    const reassigned = {
      ...released,
      acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
    };
    await commitProjectPlan(
      'project-1',
      reassigned,
      stateFor(reassigned, members, pieces),
    );

    expect(recordUsageMock).toHaveBeenCalledTimes(1);
  });

  it('clears Needs Review warnings on a successful re-commit', async () => {
    const current = plan({
      status: 'needs_review',
      invalidations: [
        {
          id: 'invalidation:test',
          message: 'C1 dimensions changed; allocation released.',
          requirementIds: ['member-a-panel-1'],
          pieceIds: [],
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
    });
    const state = stateFor(current, [member('member-a', 'C1')], [piece('piece-1')]);

    const saved = await commitProjectPlan('project-1', current, state);

    expect(saved.status).toBe('committed');
    expect(saved.invalidations).toEqual([]);
  });

  it('leaves the saved plan uncommitted when usage recording fails', async () => {
    recordUsageMock.mockRejectedValueOnce(new Error('Usage write failed.'));
    const current = plan({
      acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
    });
    const state = stateFor(current, [member('member-a', 'C1')], [piece('piece-1')]);

    await expect(
      commitProjectPlan('project-1', current, state),
    ).rejects.toThrow(/usage write failed/i);

    expect(savePlanMock).not.toHaveBeenCalled();
  });

  it('releases one allocation without disturbing another allocation on the same piece', () => {
    const current = plan({
      acceptedByRequirement: {
        'member-a-panel-1': 'piece-1',
        'member-b-panel-1': 'piece-1',
      },
      committedByRequirement: {
        'member-a-panel-1': 'piece-1',
        'member-b-panel-1': 'piece-1',
      },
      usageRecordedPieceIds: ['piece-1'],
    });

    const released = releaseAllocation(current, 'member-a-panel-1');

    expect(released.acceptedByRequirement).toEqual({
      'member-b-panel-1': 'piece-1',
    });
    expect(released.committedByRequirement).toEqual({
      'member-b-panel-1': 'piece-1',
    });
    expect(released.usageRecordedPieceIds).toEqual(['piece-1']);
  });
});
