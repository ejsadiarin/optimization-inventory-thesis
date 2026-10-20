import { describe, expect, it } from 'vitest';
import { buildProjectSummary } from './report';
import type {
  LumberRequirementInput,
  MatchPiece,
  PanelRequirement,
} from './types';

const STOCK = {
  phenolic: { length: 2.44, width: 1.22 },
  lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
};

const COSTS = { phenolicPerSheet: 850, lumberPerPiece: 120 };

function panel(id: string, length: number, width: number): PanelRequirement {
  return {
    id,
    memberId: id,
    label: id,
    memberType: 'slab',
    materialType: 'phenolic',
    sourceMemberLabel: id,
    sourceMemberType: 'slab',
    length,
    width,
    quantity: 1,
    exceedsStock: false,
  };
}

function lumber(id: string, length: number): LumberRequirementInput {
  return { id, label: id, length, crossSection: '2x3' };
}

function piece(overrides: Partial<MatchPiece> = {}): MatchPiece {
  return {
    id: 'piece-1',
    materialType: 'phenolic',
    length: 0.6,
    width: 0.6,
    condition: 'Good',
    retired: false,
    usageCount: 0,
    ...overrides,
  };
}

describe('buildProjectSummary', () => {
  it('reports plywood utilization, waste, and reusable offcut share', () => {
    const panels = [
      panel('P1', 1.2, 1.2),
      panel('P2', 1.2, 1.2),
      panel('P3', 1.2, 1.2),
      panel('P4', 1.2, 1.2),
    ];

    const summary = buildProjectSummary({
      panels,
      lumberRequirements: [],
      stock: STOCK,
      costs: COSTS,
      pieces: [],
    });

    expect(summary.newSheetsRequired).toBe(2);
    expect(summary.utilization).toBeCloseTo((5.76 / (2 * 2.44 * 1.22)) * 100);
    expect(summary.waste).toBeCloseTo(100 - summary.utilization);
    expect(summary.reusableOffcutPercent).toBeCloseTo(
      (summary.optimization.plywood.reusableOffcutArea / summary.optimization.plywood.stockArea) *
        100,
    );
  });

  it('counts distinct reused pieces and total reuse events from inventory', () => {
    const summary = buildProjectSummary({
      panels: [panel('P1', 0.5, 0.5)],
      lumberRequirements: [],
      stock: STOCK,
      costs: COSTS,
      pieces: [
        piece({ id: 'a', usageCount: 2 }),
        piece({ id: 'b', usageCount: 1 }),
        piece({ id: 'c', usageCount: 0 }),
      ],
    });

    expect(summary.reusedPieces).toBe(2);
    expect(summary.reuseEvents).toBe(3);
  });

  it('breaks down phenolic savings and new lumber cost in PHP', () => {
    const panels = [
      panel('P1', 1.2, 1.2),
      panel('P2', 1.2, 1.2),
      panel('P3', 1.2, 1.2),
      panel('P4', 1.2, 1.2),
    ];

    const summary = buildProjectSummary({
      panels,
      lumberRequirements: [lumber('L1', 2)],
      stock: STOCK,
      costs: COSTS,
      pieces: [],
    });

    expect(summary.newLumberPiecesRequired).toBe(1);
    expect(summary.procurement).toMatchObject({
      phenolicSheetCost: 850,
      phenolicSheetsUsed: 2,
      phenolicSheetsAvoided: 2,
      phenolicSavings: 1700,
      newPhenolicCost: 1700,
      lumberPieceCost: 120,
      lumberPiecesUsed: 1,
      lumberCost: 120,
      totalMaterialCost: 1820,
      totalEstimatedSavings: 1700,
    });
  });

  it('returns zeroed metrics when the project has no requirements', () => {
    const summary = buildProjectSummary({
      panels: [],
      lumberRequirements: [],
      stock: STOCK,
      costs: COSTS,
      pieces: [],
    });

    expect(summary).toMatchObject({
      utilization: 0,
      waste: 0,
      reusableOffcutPercent: 0,
      reusedPieces: 0,
      reuseEvents: 0,
      newSheetsRequired: 0,
      newLumberPiecesRequired: 0,
    });
    expect(summary.procurement.totalEstimatedSavings).toBe(0);
    expect(summary.procurement.totalMaterialCost).toBe(0);
  });
});
