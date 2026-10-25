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
  it('reports cost-weighted utilization and waste with plywood detail', () => {
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
    expect(summary.plywoodUtilization).toBeCloseTo((5.76 / (2 * 2.44 * 1.22)) * 100);
    expect(summary.plywoodWaste).toBeCloseTo(100 - summary.plywoodUtilization);
    expect(summary.utilization).toBeCloseTo(summary.plywoodUtilization);
    expect(summary.waste).toBeCloseTo(summary.plywoodWaste);
    expect(summary.lumberUtilization).toBe(0);
    expect(summary.lumberWaste).toBe(0);
  });

  it('weights overall metrics by the cost of each material stock', () => {
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

    expect(summary.plywoodUtilization).toBeCloseTo(96.7481859715);
    expect(summary.lumberUtilization).toBeCloseTo(83.3333333333);
    expect(summary.utilization).toBeCloseTo(95.8636901932);
    expect(summary.waste).toBeCloseTo(4.1363098068);
  });

  it('derives reused counts from the accepted plan and excludes reused work from new stock', () => {
    const panels = [panel('P1', 1.2, 0.7), panel('P2', 1.2, 0.7), panel('P3', 1.2, 0.8)];

    const summary = buildProjectSummary({
      panels,
      lumberRequirements: [],
      stock: STOCK,
      costs: COSTS,
      pieces: [piece({ id: 'a', usageCount: 12 })],
      satisfiedRequirementIds: new Set(['P1']),
    });

    expect(summary.reusedPieces).toBe(1);
    expect(summary.reuseEvents).toBe(1);
    expect(summary.newSheetsRequired).toBe(1);
    expect(summary.procurement.phenolicSheetsAvoided).toBe(1);
    expect(summary.procurement.phenolicSavings).toBe(COSTS.phenolicPerSheet);
    expect(summary.optimization.remainingPanels.map((entry) => entry.id)).toEqual([
      'P2',
      'P3',
    ]);
  });

  it('ignores lifetime usage and stale accepted ids', () => {
    const summary = buildProjectSummary({
      panels: [panel('P1', 0.5, 0.5)],
      lumberRequirements: [],
      stock: STOCK,
      costs: COSTS,
      pieces: [piece({ id: 'a', usageCount: 4 })],
      satisfiedRequirementIds: new Set(['removed-panel']),
    });

    expect(summary.reusedPieces).toBe(0);
    expect(summary.reuseEvents).toBe(0);
    expect(summary.newSheetsRequired).toBe(1);
  });

  it('breaks down phenolic savings and new lumber cost in PHP', () => {
    const panels = [panel('P1', 1.2, 0.7), panel('P2', 1.2, 0.8)];

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
      phenolicSheetsUsed: 1,
      phenolicSheetsAvoided: 1,
      phenolicSavings: 850,
      newPhenolicCost: 850,
      lumberPieceCost: 120,
      lumberPiecesUsed: 1,
      lumberCost: 120,
      totalMaterialCost: 970,
      totalEstimatedSavings: 850,
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
      plywoodUtilization: 0,
      plywoodWaste: 0,
      lumberUtilization: 0,
      lumberWaste: 0,
      reusedPieces: 0,
      reuseEvents: 0,
      newSheetsRequired: 0,
      newLumberPiecesRequired: 0,
    });
    expect(summary.procurement.totalEstimatedSavings).toBe(0);
    expect(summary.procurement.totalMaterialCost).toBe(0);
  });
});
