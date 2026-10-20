import { optimizeProject } from './index';
import type {
  LumberRequirementInput,
  MatchPiece,
  OptimizationResult,
  PanelRequirement,
  StockSize,
} from './types';

export interface ProjectSummaryInput {
  panels: PanelRequirement[];
  lumberRequirements: LumberRequirementInput[];
  stock: {
    phenolic: StockSize;
    lumberLengths: number[];
  };
  costs: {
    phenolicPerSheet: number;
    lumberPerPiece: number;
  };
  pieces: MatchPiece[];
  satisfiedRequirementIds?: ReadonlySet<string>;
}

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
  reusableOffcutPercent: number;
  lumberUtilization: number;
  reusedPieces: number;
  reuseEvents: number;
  newSheetsRequired: number;
  newLumberPiecesRequired: number;
  procurement: ProcurementBreakdown;
  optimization: OptimizationResult;
}

/**
 * Builds the project-level report from the same pure optimization result the
 * Optimize screen uses. Reuse counts come from the recorded usage on inventory
 * pieces; the engine deliberately does not persist accepted matches.
 */
export function buildProjectSummary(input: ProjectSummaryInput): ProjectSummary {
  const optimization = optimizeProject({
    panels: input.panels,
    lumberRequirements: input.lumberRequirements,
    stock: input.stock,
    costs: input.costs,
    pieces: input.pieces,
    satisfiedRequirementIds: input.satisfiedRequirementIds,
  });

  const { plywood, lumber, stats } = optimization;

  const reusedPieces = input.pieces.filter((piece) => (piece.usageCount ?? 0) > 0).length;
  const reuseEvents = input.pieces.reduce((total, piece) => total + (piece.usageCount ?? 0), 0);

  const phenolicSheetCost = input.costs.phenolicPerSheet;
  const phenolicSavings = stats.plywood.sheetsSaved * phenolicSheetCost;
  const newPhenolicCost = stats.plywood.sheetsUsed * phenolicSheetCost;
  const lumberCost = stats.lumber.stockPiecesUsed * input.costs.lumberPerPiece;

  return {
    utilization: plywood.utilization,
    waste: plywood.waste,
    reusableOffcutPercent:
      plywood.stockArea > 0 ? (plywood.reusableOffcutArea / plywood.stockArea) * 100 : 0,
    lumberUtilization: lumber.utilization,
    reusedPieces,
    reuseEvents,
    newSheetsRequired: stats.plywood.sheetsUsed,
    newLumberPiecesRequired: stats.lumber.stockPiecesUsed,
    procurement: {
      phenolicSheetCost,
      phenolicSheetsUsed: stats.plywood.sheetsUsed,
      phenolicSheetsAvoided: stats.plywood.sheetsSaved,
      phenolicSavings,
      newPhenolicCost,
      lumberPieceCost: input.costs.lumberPerPiece,
      lumberPiecesUsed: stats.lumber.stockPiecesUsed,
      lumberCost,
      totalMaterialCost: newPhenolicCost + lumberCost,
      totalEstimatedSavings: phenolicSavings,
    },
    optimization,
  };
}
