import { describe, expect, it } from 'vitest';
import {
  allocationsForAssignments,
  assignPanelsToPieces,
  canFitRequirementAlongside,
  countReusablePanels,
} from './panelAssignments';
import type { MatchPiece, MatchRequirement, PlywoodPanel } from '@/engine/types';

function panel(id: string, length: number, width: number): PlywoodPanel {
  return { id, label: id, length, width };
}

function piece(
  id: string,
  length: number,
  width: number,
  overrides: Partial<MatchPiece> = {},
): MatchPiece {
  return {
    id,
    materialType: 'phenolic',
    condition: 'Good',
    retired: false,
    length,
    width,
    ...overrides,
  };
}

function requirement(
  id: string,
  length: number,
  width: number,
  overrides: Partial<MatchRequirement> = {},
): MatchRequirement {
  return {
    id,
    materialType: 'phenolic',
    label: id,
    length,
    width,
    ...overrides,
  };
}

describe('assignPanelsToPieces', () => {
  it('assigns several panels to one piece when they nest', () => {
    const summary = assignPanelsToPieces(
      [panel('p1', 2.2, 0.3), panel('p2', 2.2, 0.3)],
      [piece('piece-1', 2.44, 1.22)],
    );

    expect(summary.assignments).toEqual({ p1: 'piece-1', p2: 'piece-1' });
    expect(summary.allocations).toHaveLength(1);
    expect(summary.allocations[0]!.panelIds).toEqual(['p1', 'p2']);
    expect(summary.coveredPanelCount).toBe(2);
  });

  it('does not book one panel to two pieces or two panels to one full piece', () => {
    const summary = assignPanelsToPieces(
      [panel('a', 0.7, 0.7), panel('b', 0.7, 0.7)],
      [piece('small', 1, 1), piece('large', 2.44, 1.22)],
    );

    expect(Object.values(summary.assignments)).toHaveLength(2);
    expect(new Set(Object.keys(summary.assignments)).size).toBe(2);
    expect(summary.assignments.a).toBe('large');
    expect(summary.assignments.b).toBe('large');
    expect(summary.allocations).toHaveLength(1);
  });

  it('counts covered panels rather than pieces', () => {
    expect(
      countReusablePanels(
        [panel('p1', 2.2, 0.3), panel('p2', 2.2, 0.3), panel('p3', 2.2, 0.3)],
        [piece('piece-1', 2.44, 1.22)],
      ),
    ).toBe(3);
  });
});

describe('canFitRequirementAlongside', () => {
  it('allows a second panel while the piece still has room', () => {
    expect(
      canFitRequirementAlongside(
        requirement('side-1', 2, 0.4),
        [requirement('bottom', 2, 0.2)],
        piece('piece-1', 2.44, 0.6),
      ),
    ).toBe(true);
  });

  it('rejects a panel when the accepted panels already fill the piece', () => {
    expect(
      canFitRequirementAlongside(
        requirement('side-2', 2, 0.4),
        [requirement('bottom', 2, 0.2), requirement('side-1', 2, 0.4)],
        piece('piece-1', 2.44, 0.6),
      ),
    ).toBe(false);
  });

  it('rejects a larger panel that would evict an already accepted panel', () => {
    expect(
      canFitRequirementAlongside(
        requirement('wide', 2, 0.6),
        [requirement('accepted', 2, 0.4)],
        piece('piece-1', 2.44, 0.6),
      ),
    ).toBe(false);
  });

  it('keeps lumber to one requirement per piece', () => {
    expect(
      canFitRequirementAlongside(
        requirement('brace-b', 2, 0, {
          materialType: 'lumber',
          crossSection: '2x3',
        }),
        [
          requirement('brace-a', 2, 0, {
            materialType: 'lumber',
            crossSection: '2x3',
          }),
        ],
        piece('lumber-1', 3, 0, {
          materialType: 'lumber',
          crossSection: '2x3',
        }),
      ),
    ).toBe(false);
  });
});

describe('allocationsForAssignments', () => {
  it('groups accepted requirements by piece into one cut plan', () => {
    const requirements = [
      requirement('panel-1', 2.2, 0.3),
      requirement('panel-2', 2.2, 0.3),
    ];

    const allocations = allocationsForAssignments(
      new Map([
        ['panel-1', 'piece-1'],
        ['panel-2', 'piece-1'],
      ]),
      requirements,
      [piece('piece-1', 2.44, 1.22)],
    );

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.panelIds).toEqual(['panel-1', 'panel-2']);
    expect(allocations[0]!.plan.stock).toEqual({ length: 2.44, width: 1.22 });
  });

  it('ignores requirements without an active phenolic piece', () => {
    const allocations = allocationsForAssignments(
      new Map([['panel-1', 'missing']]),
      [requirement('panel-1', 0.6, 0.6)],
      [],
    );

    expect(allocations).toEqual([]);
  });
});
