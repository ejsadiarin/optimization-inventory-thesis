import type {
  CuttingStats,
  LumberPlan,
  LumberStats,
  PlywoodPlan,
  PlywoodStats,
} from './types';

const EPS = 1e-9;

export interface CuttingCosts {
  phenolicPerSheet: number;
  lumberPerPiece: number;
}

export function naiveSheetBaseline(totalPanelArea: number, stockArea: number): number {
  if (!(totalPanelArea > 0) || !(stockArea > 0)) return 0;
  return Math.ceil(totalPanelArea / stockArea - EPS);
}

export function calculateSavings(
  naiveSheets: number,
  optimizedSheets: number,
  costPerSheet: number,
): number {
  return Math.max(0, (naiveSheets - optimizedSheets) * costPerSheet);
}

export function calculatePlywoodStats(plan: PlywoodPlan, costPerSheet: number): PlywoodStats {
  const stockArea = plan.stock.length * plan.stock.width;
  const naiveSheets = naiveSheetBaseline(plan.usedArea, stockArea);
  const sheetsSaved = Math.max(0, naiveSheets - plan.sheetsUsed);

  return {
    sheetsUsed: plan.sheetsUsed,
    naiveSheets,
    sheetsSaved,
    totalPanelArea: plan.usedArea,
    totalStockArea: plan.stockArea,
    utilization: plan.utilization,
    waste: plan.waste,
    reusableOffcutArea: plan.reusableOffcutArea,
    estimatedSavings: calculateSavings(naiveSheets, plan.sheetsUsed, costPerSheet),
  };
}

export function calculateLumberStats(plan: LumberPlan, costPerPiece: number): LumberStats {
  return {
    stockPiecesUsed: plan.stockPiecesUsed,
    totalStockLength: plan.totalStockLength,
    totalCutLength: plan.totalCutLength,
    totalOffcutLength: plan.totalOffcutLength,
    utilization: plan.utilization,
    waste: plan.waste,
    estimatedCost: plan.stockPiecesUsed * costPerPiece,
  };
}

export function calculateStats(
  plywood: PlywoodPlan,
  lumber: LumberPlan,
  costs: CuttingCosts,
): CuttingStats {
  const plywoodStats = calculatePlywoodStats(plywood, costs.phenolicPerSheet);
  const lumberStats = calculateLumberStats(lumber, costs.lumberPerPiece);

  return {
    plywood: plywoodStats,
    lumber: lumberStats,
    estimatedSavings: plywoodStats.estimatedSavings,
  };
}
