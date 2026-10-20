import { LUMBER_CROSS_SECTIONS } from '@/db/types';
import type {
  LumberCut,
  LumberGroupPlan,
  LumberPlan,
  LumberRequirementInput,
  LumberStockPlan,
  LumberUnplaced,
} from './types';

const EPS = 1e-9;

interface StockState {
  stockLength: number;
  cuts: LumberCut[];
  usedLength: number;
}

function addCut(stock: StockState, requirement: LumberRequirementInput): void {
  stock.cuts.push({
    requirementId: requirement.id,
    label: requirement.label,
    length: requirement.length,
    position: stock.usedLength,
  });
  stock.usedLength += requirement.length;
}

export function optimizeLumber(
  requirements: readonly LumberRequirementInput[],
  stockLengths: readonly number[],
): LumberPlan {
  const availableLengths = stockLengths
    .filter((length) => Number.isFinite(length) && length > 0)
    .sort((a, b) => a - b);

  const groups: LumberGroupPlan[] = [];
  const unplacedRequirements: LumberUnplaced[] = [];
  let stockIndex = 0;

  for (const crossSection of LUMBER_CROSS_SECTIONS) {
    const items = requirements
      .filter((requirement) => requirement.crossSection === crossSection)
      .sort(
        (a, b) =>
          b.length - a.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );

    if (items.length === 0) continue;

    const stocks: StockState[] = [];

    for (const requirement of items) {
      const existing = stocks.find(
        (stock) => stock.stockLength - stock.usedLength >= requirement.length - EPS,
      );

      if (existing) {
        addCut(existing, requirement);
        continue;
      }

      const stockLength = availableLengths.find(
        (length) => length >= requirement.length - EPS,
      );

      if (stockLength === undefined) {
        unplacedRequirements.push({
          requirementId: requirement.id,
          label: requirement.label,
          length: requirement.length,
          crossSection,
          reason: 'oversized',
        });
        continue;
      }

      const stock: StockState = { stockLength, cuts: [], usedLength: 0 };
      stocks.push(stock);
      addCut(stock, requirement);
    }

    if (stocks.length === 0) continue;

    const stockPlans: LumberStockPlan[] = stocks.map((stock) => {
      const usedLength = Math.min(stock.stockLength, stock.usedLength);
      const offcutLength = Math.max(0, stock.stockLength - stock.usedLength);
      const utilization = (usedLength / stock.stockLength) * 100;

      return {
        stockIndex: stockIndex++,
        crossSection,
        stockLength: stock.stockLength,
        cuts: stock.cuts,
        usedLength,
        offcutLength,
        utilization,
        waste: 100 - utilization,
      };
    });

    const totalStockLength = stockPlans.reduce(
      (total, stock) => total + stock.stockLength,
      0,
    );
    const totalCutLength = stockPlans.reduce((total, stock) => total + stock.usedLength, 0);
    const totalOffcutLength = stockPlans.reduce(
      (total, stock) => total + stock.offcutLength,
      0,
    );
    const utilization =
      totalStockLength > 0 ? (totalCutLength / totalStockLength) * 100 : 0;

    groups.push({
      crossSection,
      stocks: stockPlans,
      stockPiecesUsed: stockPlans.length,
      totalStockLength,
      totalCutLength,
      totalOffcutLength,
      utilization,
      waste: 100 - utilization,
    });
  }

  const stocks = groups.flatMap((group) => group.stocks);
  const totalStockLength = groups.reduce((total, group) => total + group.totalStockLength, 0);
  const totalCutLength = groups.reduce((total, group) => total + group.totalCutLength, 0);
  const totalOffcutLength = groups.reduce(
    (total, group) => total + group.totalOffcutLength,
    0,
  );
  const utilization =
    totalStockLength > 0 ? (totalCutLength / totalStockLength) * 100 : 0;

  return {
    groups,
    stocks,
    stockPiecesUsed: stocks.length,
    totalStockLength,
    totalCutLength,
    totalOffcutLength,
    utilization,
    waste: totalStockLength > 0 ? 100 - utilization : 0,
    unplacedRequirements,
  };
}
