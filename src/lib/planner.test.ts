import { describe, expect, it } from 'vitest';
import { emptyProjectPlan, type ProjectPlan } from '@/db/plan';
import type {
  LumberRequirement,
  ProjectCosts,
  ProjectStock,
  StructuralMember,
} from '@/db/types';
import type { MatchPiece } from '@/engine/types';
import {
  buildPlannerState,
  pieceSnapshotsFor,
  reconcileProjectPlan,
  requirementSnapshotsFor,
} from './planner';

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

function lumber(
  id: string,
  overrides: Partial<LumberRequirement> = {},
): LumberRequirement {
  return {
    id,
    projectId: 'project-1',
    label: id,
    length: 8,
    crossSection: '2x4',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildPlannerState', () => {
  it('builds one shared board from two members and projects it into both members', () => {
    const state = buildPlannerState({
      members: [member('member-a', 'C1'), member('member-b', 'C2')],
      lumber: [],
      pieces: [piece('piece-1')],
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: {
          'member-a-panel-1': 'piece-1',
          'member-b-panel-1': 'piece-1',
        },
      }),
    });

    expect(state.boards).toHaveLength(1);
    expect(state.boards[0]!.source).toBe('reuse');
    expect(state.boards[0]!.panels.map((panel) => panel.memberId).sort()).toEqual([
      'member-a',
      'member-b',
    ]);

    for (const memberId of ['member-a', 'member-b']) {
      const projection = state.memberProjections.get(memberId)!;
      expect(projection.boards).toHaveLength(1);
      expect(projection.distinctBoardCount).toBe(1);
      expect(projection.panelCoverage).toEqual({
        total: 1,
        reused: 1,
        newStock: 0,
        unplaced: 0,
      });
    }
  });

  it('drops an accepted assignment whose piece is missing and asks for a decision', () => {
    const state = buildPlannerState({
      members: [member('member-a', 'C1')],
      lumber: [],
      pieces: [piece('available-piece')],
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: { 'member-a-panel-1': 'missing-piece' },
      }),
    });

    expect(state.acceptedByRequirement).not.toHaveProperty('member-a-panel-1');
    expect(
      state.reviews.find((review) => review.group.requirement.id === 'member-a-panel-1')
        ?.status,
    ).toBe('needsDecision');
  });

  it('drops an accepted assignment whose piece is retired and asks for a decision', () => {
    const state = buildPlannerState({
      members: [member('member-a', 'C1')],
      lumber: [],
      pieces: [
        piece('retired-piece', { retired: true, condition: 'Retired' }),
        piece('available-piece'),
      ],
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: { 'member-a-panel-1': 'retired-piece' },
      }),
    });

    expect(state.acceptedByRequirement).not.toHaveProperty('member-a-panel-1');
    expect(
      state.reviews.find((review) => review.group.requirement.id === 'member-a-panel-1')
        ?.status,
    ).toBe('needsDecision');
  });

  it('drops an accepted assignment that no longer fits the piece geometry', () => {
    const state = buildPlannerState({
      members: [member('member-a', 'C1')],
      lumber: [],
      pieces: [piece('small-piece', { length: 5, width: 5 }), piece('available-piece')],
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: { 'member-a-panel-1': 'small-piece' },
      }),
    });

    expect(state.acceptedByRequirement).not.toHaveProperty('member-a-panel-1');
    expect(
      state.reviews.find((review) => review.group.requirement.id === 'member-a-panel-1')
        ?.status,
    ).toBe('needsDecision');
  });

  it('keeps project-level and member-linked lumber distinguishable', () => {
    const state = buildPlannerState({
      members: [member('member-a', 'C1')],
      lumber: [
        lumber('lumber-member', { memberId: 'member-a', label: 'C1 brace' }),
        lumber('lumber-project', { label: 'Project brace' }),
      ],
      pieces: [],
      stock,
      costs,
      plan: emptyProjectPlan(),
    });

    expect(
      state.requirements.find((requirement) => requirement.id === 'lumber-member')
        ?.memberId,
    ).toBe('member-a');
    expect(
      state.requirements.find((requirement) => requirement.id === 'lumber-project')
        ?.memberId,
    ).toBeUndefined();
    expect(
      state.optimization.remainingLumberRequirements.find(
        (requirement) => requirement.id === 'lumber-member',
      )?.memberId,
    ).toBe('member-a');
    expect(
      state.optimization.remainingLumberRequirements.find(
        (requirement) => requirement.id === 'lumber-project',
      )?.memberId,
    ).toBeUndefined();
  });
});

describe('reconcileProjectPlan', () => {
  function committedPlanFor(state: ReturnType<typeof buildPlannerState>) {
    const accepted = { ...state.acceptedByRequirement };
    const committedPieces = [...new Set(Object.values(accepted))];
    return plan({
      status: 'committed',
      acceptedByRequirement: accepted,
      committedByRequirement: accepted,
      requirementSnapshots: requirementSnapshotsFor(state.requirements),
      pieceSnapshots: pieceSnapshotsFor(state.pieces),
      usageRecordedPieceIds: committedPieces,
    });
  }

  function acceptedState() {
    const availablePieces = [piece('piece-1')];
    const before = buildPlannerState({
      members: [member('member-a', 'C1')],
      lumber: [],
      pieces: availablePieces,
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: { 'member-a-panel-1': 'piece-1' },
      }),
    });
    return { before, availablePieces };
  }

  it('returns the same plan when nothing changed', () => {
    const { before, availablePieces } = acceptedState();
    const committed = committedPlanFor(before);

    const result = reconcileProjectPlan(committed, before.requirements, availablePieces);

    expect(result.plan).toBe(committed);
    expect(result.invalidations).toEqual([]);
  });

  it('releases only the allocation affected by a member dimension change', () => {
    const { before, availablePieces } = acceptedState();
    const committed = committedPlanFor(before);
    const changed = buildPlannerState({
      members: [{ ...member('member-a', 'C1'), length: 12 }],
      lumber: [],
      pieces: availablePieces,
      stock,
      costs,
      plan: committed,
    });

    const result = reconcileProjectPlan(committed, changed.requirements, availablePieces);
    const after = buildPlannerState({
      members: [{ ...member('member-a', 'C1'), length: 12 }],
      lumber: [],
      pieces: availablePieces,
      stock,
      costs,
      plan: result.plan,
    });

    expect(result.plan.status).toBe('needs_review');
    expect(result.plan.committedByRequirement).toEqual({});
    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0]!.message).toMatch(/C1 dimensions changed/i);
    expect(
      after.reviews.find((review) => review.group.requirement.id === 'member-a-panel-1')
        ?.status,
    ).toBe('needsDecision');
  });

  it('releases only the allocation affected by a retired piece', () => {
    const { before, availablePieces } = acceptedState();
    const committed = committedPlanFor(before);
    const retired = [{ ...availablePieces[0]!, retired: true, condition: 'Retired' as const }];

    const result = reconcileProjectPlan(committed, before.requirements, retired);

    expect(result.plan.status).toBe('needs_review');
    expect(result.plan.committedByRequirement).toEqual({});
    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0]!.message).toMatch(/was retired/i);
  });

  it('releases only the allocation affected by a piece dimension change', () => {
    const { before, availablePieces } = acceptedState();
    const committed = committedPlanFor(before);
    const resized = [{ ...availablePieces[0]!, length: 5 }];

    const result = reconcileProjectPlan(committed, before.requirements, resized);

    expect(result.plan.status).toBe('needs_review');
    expect(result.plan.committedByRequirement).toEqual({});
    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0]!.message).toMatch(/board .* dimensions changed/i);
  });

  it('does not invalidate a piece that is only marked For Inspection', () => {
    const { before, availablePieces } = acceptedState();
    const committed = committedPlanFor(before);
    const inspected = [
      { ...availablePieces[0]!, condition: 'For Inspection' as const },
    ];

    const result = reconcileProjectPlan(committed, before.requirements, inspected);

    expect(result.plan).toBe(committed);
    expect(result.invalidations).toEqual([]);
  });

  it('keeps an unaffected allocation while releasing a changed sibling', () => {
    const availablePieces = [piece('piece-1'), piece('piece-2')];
    const before = buildPlannerState({
      members: [member('member-a', 'C1'), member('member-b', 'C2')],
      lumber: [],
      pieces: availablePieces,
      stock,
      costs,
      plan: plan({
        acceptedByRequirement: {
          'member-a-panel-1': 'piece-1',
          'member-b-panel-1': 'piece-2',
        },
      }),
    });
    const committed = committedPlanFor(before);
    const changed = buildPlannerState({
      members: [member('member-a', 'C1'), { ...member('member-b', 'C2'), length: 12 }],
      lumber: [],
      pieces: availablePieces,
      stock,
      costs,
      plan: committed,
    });

    const result = reconcileProjectPlan(committed, changed.requirements, availablePieces);

    expect(result.plan.committedByRequirement).toEqual({
      'member-a-panel-1': 'piece-1',
    });
    expect(result.plan.usageRecordedPieceIds).toEqual(['piece-1']);
    expect(result.invalidations).toHaveLength(1);
  });
});
