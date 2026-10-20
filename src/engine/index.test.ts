import { describe, expect, it } from 'vitest';
import { optimizeProject } from './index';
import type {
  LumberRequirementInput,
  MatchPiece,
  OptimizeInput,
  PanelRequirement,
} from './types';

const STOCK = {
  phenolic: { length: 2.44, width: 1.22 },
  lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
};

const COSTS = { phenolicPerSheet: 850, lumberPerPiece: 120 };

function panel(
  id: string,
  length: number,
  width: number,
  sourceMemberLabel = id,
): PanelRequirement {
  return {
    id,
    memberId: sourceMemberLabel,
    label: sourceMemberLabel,
    memberType: 'column',
    materialType: 'phenolic',
    sourceMemberLabel,
    sourceMemberType: 'column',
    length,
    width,
    quantity: 1,
    exceedsStock: false,
  };
}

function lumber(
  id: string,
  length: number,
  crossSection: LumberRequirementInput['crossSection'] = '2x3',
): LumberRequirementInput {
  return { id, label: id, length, crossSection };
}

function piece(overrides: Partial<MatchPiece> = {}): MatchPiece {
  return {
    id: 'piece-1',
    materialType: 'phenolic',
    length: 0.6,
    width: 0.6,
    condition: 'Good',
    retired: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<OptimizeInput> = {}): OptimizeInput {
  return {
    panels: [],
    lumberRequirements: [],
    stock: STOCK,
    costs: COSTS,
    pieces: [],
    ...overrides,
  };
}

describe('optimizeProject', () => {
  it('composes matches, remaining requirements, plans, and stats', () => {
    const panels = [panel('P1', 0.6, 0.6)];

    const result = optimizeProject(baseInput({ panels }));

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.requirement.id).toBe('P1');
    expect(result.remainingPanels).toEqual(panels);
    expect(result.remainingLumberRequirements).toEqual([]);
    expect(result.plywood.sheetsUsed).toBe(1);
    expect(result.lumber.groups).toEqual([]);
    expect(result.stats.plywood.sheetsUsed).toBe(1);
    expect(result.stats.estimatedSavings).toBe(0);
  });

  it('keeps matched requirements in the plan until they are explicitly satisfied', () => {
    const panels = [panel('P1', 0.6, 0.6)];

    const result = optimizeProject(baseInput({ panels, pieces: [piece()] }));

    expect(result.matches[0]!.candidates).toHaveLength(1);
    expect(result.remainingPanels).toHaveLength(1);
    expect(result.plywood.sheetsUsed).toBe(1);
  });

  it('removes satisfied requirements from the cutting plan', () => {
    const panels = [panel('P1', 0.6, 0.6)];

    const result = optimizeProject(
      baseInput({ panels, satisfiedRequirementIds: new Set(['P1']) }),
    );

    expect(result.remainingPanels).toEqual([]);
    expect(result.plywood.sheets).toEqual([]);
    expect(result.plywood.sheetsUsed).toBe(0);
    expect(result.stats.plywood.sheetsUsed).toBe(0);
  });

  it('splits remaining requirements by material type', () => {
    const panels = [panel('P1', 0.6, 0.6), panel('BIG', 3.0, 1.5)];
    const lumberRequirements = [lumber('L1', 2.0), lumber('L2', 0.3)];

    const result = optimizeProject(baseInput({ panels, lumberRequirements }));

    expect(result.remainingLumberRequirements).toHaveLength(2);
    expect(result.lumber.groups.map((group) => group.crossSection)).toEqual(['2x3']);
    expect(result.lumber.stockPiecesUsed).toBe(1);
    expect(result.plywood.oversizedPanels.map((entry) => entry.panelId)).toEqual(['BIG']);
  });

  it('preserves the source member label on placed panels', () => {
    const panels = [panel('C1-panel-1', 0.5, 1.2, 'C1')];

    const result = optimizeProject(baseInput({ panels }));

    const [sheet] = result.plywood.sheets;
    expect(sheet!.panels[0]).toMatchObject({
      panelId: 'C1-panel-1',
      sourceMemberLabel: 'C1',
    });
  });

  it('returns empty plans and zeroed stats when nothing remains', () => {
    const result = optimizeProject(baseInput());

    expect(result.matches).toEqual([]);
    expect(result.remainingPanels).toEqual([]);
    expect(result.plywood.sheetsUsed).toBe(0);
    expect(result.lumber.stockPiecesUsed).toBe(0);
    expect(result.stats.plywood.estimatedSavings).toBe(0);
    expect(result.stats.lumber.estimatedCost).toBe(0);
  });
});
