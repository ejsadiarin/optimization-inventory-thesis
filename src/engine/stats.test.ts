import { describe, expect, it } from 'vitest';
import { optimizeLumber } from './lumber';
import { optimizePlywood } from './plywood';
import {
  calculateLumberStats,
  calculatePlywoodStats,
  calculateSavings,
  calculateStats,
} from './stats';
import type { PlywoodPanel } from './types';

const STOCK = { length: 2.44, width: 1.22 };
const STOCK_AREA = STOCK.length * STOCK.width;
const COSTS = { phenolicPerSheet: 850, lumberPerPiece: 120 };
const LUMBER_STOCK = [2.4, 3.0, 3.6, 4.8, 6.0];

function panel(id: string, length: number, width: number): PlywoodPanel {
  return { id, label: id, length, width };
}

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

describe('calculateSavings', () => {
  it('credits every sheet saved at the configured unit cost', () => {
    expect(calculateSavings(3, 2, 850)).toBe(850);
    expect(calculateSavings(5, 1, 850)).toBe(3400);
  });

  it('never returns negative savings', () => {
    expect(calculateSavings(2, 2, 850)).toBe(0);
    expect(calculateSavings(2, 3, 850)).toBe(0);
    expect(calculateSavings(3, 2, 0)).toBe(0);
  });
});

describe('calculatePlywoodStats', () => {
  it('reports full utilization for an exact-fill sheet', () => {
    const plan = optimizePlywood([panel('p', STOCK.length, STOCK.width)], STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.sheetsUsed).toBe(1);
    expect(stats.naiveSheets).toBe(1);
    expect(stats.sheetsSaved).toBe(0);
    expect(stats.totalPanelArea).toBeCloseTo(STOCK_AREA);
    expect(stats.totalStockArea).toBeCloseTo(STOCK_AREA);
    expect(stats.utilization).toBeCloseTo(100);
    expect(stats.waste).toBeCloseTo(0);
    expect(stats.estimatedSavings).toBe(0);
  });

  it('separates reusable offcuts from waste', () => {
    const plan = optimizePlywood([panel('p', 2.14, 0.92)], STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.utilization).toBeCloseTo((1.9688 / STOCK_AREA) * 100);
    expect(stats.reusableOffcutArea).toBeCloseTo(1.008);
    expect(stats.waste).toBeCloseTo(0);
  });

  it('counts tiny offcuts as waste', () => {
    const plan = optimizePlywood([panel('p', 2.439, 1.219)], STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.utilization).toBeCloseTo((2.973141 / STOCK_AREA) * 100);
    expect(stats.reusableOffcutArea).toBeCloseTo(0);
    expect(stats.waste).toBeCloseTo(100 - stats.utilization);
  });

  it('credits savings when sorting packs one fewer sheet than input order', () => {
    const panels = [panel('narrow', 1.2, 0.7), panel('wide', 1.2, 0.8)];
    const plan = optimizePlywood(panels, STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.sheetsUsed).toBe(1);
    expect(stats.naiveSheets).toBe(2);
    expect(stats.sheetsSaved).toBe(1);
    expect(stats.estimatedSavings).toBe(COSTS.phenolicPerSheet);
  });

  it('excludes oversized panels from the unoptimized baseline', () => {
    const panels = [
      panel('narrow', 1.2, 0.7),
      panel('wide', 1.2, 0.8),
      panel('big', 3, 1.5),
    ];
    const plan = optimizePlywood(panels, STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.sheetsUsed).toBe(1);
    expect(stats.naiveSheets).toBe(2);
    expect(stats.sheetsSaved).toBe(1);
    expect(stats.estimatedSavings).toBe(COSTS.phenolicPerSheet);
  });

  it('returns zeroed stats for an empty plan', () => {
    const plan = optimizePlywood([], STOCK);
    const stats = calculatePlywoodStats(plan, COSTS.phenolicPerSheet);

    expect(stats.sheetsUsed).toBe(0);
    expect(stats.naiveSheets).toBe(0);
    expect(stats.sheetsSaved).toBe(0);
    expect(stats.utilization).toBe(0);
    expect(stats.waste).toBe(0);
    expect(stats.estimatedSavings).toBe(0);
  });
});

describe('calculateLumberStats', () => {
  it('totals cut length, stock length, offcut, and cost', () => {
    const plan = optimizeLumber(
      [{ id: 'a', label: 'A', length: 2.0, crossSection: '2x3' }],
      LUMBER_STOCK,
    );
    const stats = calculateLumberStats(plan, COSTS.lumberPerPiece);

    expect(stats.stockPiecesUsed).toBe(1);
    expect(stats.totalStockLength).toBeCloseTo(2.4);
    expect(stats.totalCutLength).toBeCloseTo(2.0);
    expect(stats.totalOffcutLength).toBeCloseTo(0.4);
    expect(stats.utilization).toBeCloseTo((2.0 / 2.4) * 100);
    expect(stats.waste).toBeCloseTo(100 - (2.0 / 2.4) * 100);
    expect(stats.estimatedCost).toBe(120);
  });

  it('returns zeroed stats for empty lumber requirements', () => {
    const stats = calculateLumberStats(optimizeLumber([], LUMBER_STOCK), COSTS.lumberPerPiece);

    expect(stats.stockPiecesUsed).toBe(0);
    expect(stats.totalCutLength).toBe(0);
    expect(stats.utilization).toBe(0);
    expect(stats.waste).toBe(0);
    expect(stats.estimatedCost).toBe(0);
  });
});

describe('calculateStats', () => {
  it('combines plywood savings with lumber totals', () => {
    const plywood = optimizePlywood([panel('p', STOCK.length, STOCK.width)], STOCK);
    const lumber = optimizeLumber(
      [{ id: 'a', label: 'A', length: 2.0, crossSection: '2x4' }],
      LUMBER_STOCK,
    );

    const stats = calculateStats(plywood, lumber, COSTS);

    expect(stats.plywood.sheetsUsed).toBe(1);
    expect(stats.plywood.estimatedSavings).toBe(0);
    expect(stats.lumber.stockPiecesUsed).toBe(1);
    expect(stats.lumber.estimatedCost).toBe(120);
    expect(stats.estimatedSavings).toBe(stats.plywood.estimatedSavings);
  });

  it('keeps overall savings non-negative when optimization needs more sheets than the baseline', () => {
    const plywood = optimizePlywood([panel('p', STOCK.length, STOCK.width)], STOCK);
    const lumber = optimizeLumber(
      [{ id: 'a', label: 'A', length: 3.5, crossSection: '2x3' }],
      LUMBER_STOCK,
    );

    const stats = calculateStats(plywood, lumber, COSTS);
    const sheetSaving = calculateSavings(stats.plywood.naiveSheets, stats.plywood.sheetsUsed, 850);

    expect(stats.estimatedSavings).toBe(sheetSaving);
    expect(stats.estimatedSavings).toBeGreaterThanOrEqual(0);
    expect(first(lumber.groups).stocks).toHaveLength(1);
  });
});
