import { optimizeProject } from './index';
import type { OptimizationResult, OptimizeInput } from './types';

export type ProjectSummaryInput = OptimizeInput;

export interface ProcurementBreakdown {
  phenolicSheetCost: number;
  phenolicSheetsUsed: number;
  phenolicSheetsAvoided: number;
  phenolicSavings: number;
  newPhenolicCost: number;
  lumberPieceCost: number;
  lumberPiecesUsed: number;
  lumberCost: number;
  totalMaterialCost: number;
  totalEstimatedSavings: number;
}

export interface ProjectSummary {
  utilization: number;
  waste: number;
  plywoodUtilization: number;
  plywoodWaste: number;
  lumberUtilization: number;
  lumberWaste: number;
  reusedPieces: number;
  reuseEvents: number;
  newSheetsRequired: number;
  newLumberPiecesRequired: number;
  procurement: ProcurementBreakdown;
  optimization: OptimizationResult;
}

export function buildProjectSummary(input: ProjectSummaryInput): ProjectSummary {
  const requirementIds = new Set([
    ...input.panels.map((panel) => panel.id),
    ...input.lumberRequirements.map((requirement) => requirement.id),
  ]);
  const satisfiedRequirementIds = new Set(
    Array.from(input.satisfiedRequirementIds ?? []).filter((id) => requirementIds.has(id)),
  );

  const optimization = optimizeProject({
    ...input,
    satisfiedRequirementIds,
  });

  const { plywood, lumber, stats } = optimization;

  const phenolicSheetCost = input.costs.phenolicPerSheet;
  const phenolicSavings = stats.plywood.sheetsSaved * phenolicSheetCost;
  const newPhenolicCost = stats.plywood.sheetsUsed * phenolicSheetCost;
  const lumberPieceCost = input.costs.lumberPerPiece;
  const lumberCost = stats.lumber.stockPiecesUsed * lumberPieceCost;
  const plywoodStockCost = stats.plywood.sheetsUsed * phenolicSheetCost;
  const lumberStockCost = stats.lumber.stockPiecesUsed * lumberPieceCost;
  const totalStockCost = plywoodStockCost + lumberStockCost;
  const utilization =
    totalStockCost > 0
      ? (plywood.utilization * plywoodStockCost + lumber.utilization * lumberStockCost) /
        totalStockCost
      : 0;
  const waste =
    totalStockCost > 0
      ? (plywood.waste * plywoodStockCost + lumber.waste * lumberStockCost) / totalStockCost
      : 0;

  const procurement: ProcurementBreakdown = {
    phenolicSheetCost,
    phenolicSheetsUsed: stats.plywood.sheetsUsed,
    phenolicSheetsAvoided: stats.plywood.sheetsSaved,
    phenolicSavings,
    newPhenolicCost,
    lumberPieceCost,
    lumberPiecesUsed: stats.lumber.stockPiecesUsed,
    lumberCost,
    totalMaterialCost: newPhenolicCost + lumberCost,
    totalEstimatedSavings: phenolicSavings,
  };

  return {
    utilization,
    waste,
    plywoodUtilization: plywood.utilization,
    plywoodWaste: plywood.waste,
    lumberUtilization: lumber.utilization,
    lumberWaste: lumber.waste,
    reusedPieces: satisfiedRequirementIds.size,
    reuseEvents: satisfiedRequirementIds.size,
    newSheetsRequired: procurement.phenolicSheetsUsed,
    newLumberPiecesRequired: procurement.lumberPiecesUsed,
    procurement,
    optimization,
  };
}
