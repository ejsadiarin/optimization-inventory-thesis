import { describe, expect, it } from 'vitest';
import type { CrossSection } from '@/db/types';
import { optimizeLumber } from './lumber';
import type { LumberRequirementInput } from './types';

const STOCK_LENGTHS = [2.4, 3.0, 3.6, 4.8, 6.0];

function requirement(
  id: string,
  length: number,
  crossSection: CrossSection = '2x3',
): LumberRequirementInput {
  return { id, label: id.toUpperCase(), length, crossSection };
}

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

function group(plan: ReturnType<typeof optimizeLumber>, crossSection: CrossSection) {
  const match = plan.groups.find((entry) => entry.crossSection === crossSection);
  if (!match) throw new Error(`missing group ${crossSection}`);
  return match;
}

describe('optimizeLumber', () => {
  it('returns an empty plan for empty requirements', () => {
    const plan = optimizeLumber([], STOCK_LENGTHS);

    expect(plan.groups).toEqual([]);
    expect(plan.stocks).toEqual([]);
    expect(plan.stockPiecesUsed).toBe(0);
    expect(plan.totalCutLength).toBe(0);
    expect(plan.utilization).toBe(0);
    expect(plan.waste).toBe(0);
    expect(plan.unplacedRequirements).toEqual([]);
  });

  it('groups cuts by exact cross-section and never mixes sections', () => {
    const plan = optimizeLumber(
      [
        requirement('a', 2.0, '2x3'),
        requirement('b', 2.0, '2x4'),
        requirement('c', 1.5, '2x3'),
      ],
      STOCK_LENGTHS,
    );

    expect(plan.groups.map((entry) => entry.crossSection).sort()).toEqual(['2x3', '2x4']);

    const twoByThree = group(plan, '2x3');
    const twoByFour = group(plan, '2x4');

    expect(twoByThree.stocks.flatMap((stock) => stock.cuts).map((cut) => cut.requirementId)).toEqual(
      expect.arrayContaining(['a', 'c']),
    );
    expect(twoByFour.stocks.flatMap((stock) => stock.cuts).map((cut) => cut.requirementId)).toEqual([
      'b',
    ]);
    expect(plan.stocks.every((stock) => stock.crossSection === '2x3' || stock.crossSection === '2x4')).toBe(
      true,
    );
    expect(plan.stockPiecesUsed).toBe(twoByThree.stockPiecesUsed + twoByFour.stockPiecesUsed);
  });

  it('sorts lengths descending and packs them first-fit into a stock piece', () => {
    const plan = optimizeLumber(
      [requirement('small', 0.4), requirement('large', 2.0)],
      STOCK_LENGTHS,
    );

    const twoByThree = group(plan, '2x3');
    expect(twoByThree.stockPiecesUsed).toBe(1);

    const stock = first(twoByThree.stocks);
    expect(stock.stockLength).toBe(2.4);
    expect(stock.cuts.map((cut) => cut.requirementId)).toEqual(['large', 'small']);
    expect(stock.cuts.map((cut) => cut.position)).toEqual([0, 2.0]);
    expect(stock.offcutLength).toBeCloseTo(0, 9);
    expect(twoByThree.utilization).toBeCloseTo(100);
  });

  it('spills into more stock pieces as needed', () => {
    const plan = optimizeLumber(
      [requirement('a', 2.0), requirement('b', 2.0), requirement('c', 2.0)],
      STOCK_LENGTHS,
    );

    const twoByThree = group(plan, '2x3');
    expect(twoByThree.stockPiecesUsed).toBe(3);
    expect(twoByThree.stocks.map((stock) => stock.stockLength)).toEqual([2.4, 2.4, 2.4]);
    expect(twoByThree.totalCutLength).toBe(6.0);
    expect(twoByThree.totalStockLength).toBeCloseTo(7.2, 9);
    expect(twoByThree.utilization).toBeCloseTo((6.0 / 7.2) * 100);
    expect(twoByThree.waste).toBeCloseTo(100 - twoByThree.utilization);
  });

  it('picks the shortest configured stock length that fits a new cut', () => {
    const plan = optimizeLumber([requirement('a', 3.5)], STOCK_LENGTHS);

    const stock = first(group(plan, '2x3').stocks);
    expect(stock.stockLength).toBe(3.6);
    expect(stock.offcutLength).toBeCloseTo(0.1, 9);
  });

  it('tracks cut positions and remaining offcut length', () => {
    const plan = optimizeLumber(
      [requirement('a', 1.0), requirement('b', 0.4), requirement('c', 1.0)],
      STOCK_LENGTHS,
    );

    const stock = first(group(plan, '2x3').stocks);
    expect(stock.cuts.map((cut) => cut.requirementId)).toEqual(['a', 'c', 'b']);
    expect(stock.cuts.map((cut) => cut.position)).toEqual([0, 1.0, 2.0]);
    expect(stock.usedLength).toBeCloseTo(2.4, 9);
    expect(stock.offcutLength).toBeCloseTo(0, 9);
    expect(stock.utilization).toBeCloseTo(100);
  });

  it('reports lumber cuts longer than every stock length explicitly', () => {
    const plan = optimizeLumber(
      [requirement('long', 7.0), requirement('short', 2.0)],
      STOCK_LENGTHS,
    );

    expect(plan.unplacedRequirements).toHaveLength(1);
    expect(first(plan.unplacedRequirements)).toMatchObject({
      requirementId: 'long',
      length: 7.0,
      crossSection: '2x3',
      reason: 'oversized',
    });

    const twoByThree = group(plan, '2x3');
    expect(twoByThree.stocks.flatMap((stock) => stock.cuts).map((cut) => cut.requirementId)).toEqual([
      'short',
    ]);
  });

  it('reports every cut as unplaced when no stock lengths are configured', () => {
    const plan = optimizeLumber([requirement('a', 2.0)], []);

    expect(plan.groups).toEqual([]);
    expect(plan.stockPiecesUsed).toBe(0);
    expect(plan.unplacedRequirements).toHaveLength(1);
  });

  it('computes utilization and waste for a partial stock piece', () => {
    const plan = optimizeLumber([requirement('a', 2.0)], STOCK_LENGTHS);

    const twoByThree = group(plan, '2x3');
    expect(twoByThree.utilization).toBeCloseTo((2.0 / 2.4) * 100);
    expect(twoByThree.waste).toBeCloseTo(100 - (2.0 / 2.4) * 100);
    expect(twoByThree.totalOffcutLength).toBeCloseTo(0.4, 9);
  });
});
