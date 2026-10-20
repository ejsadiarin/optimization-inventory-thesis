import type { CrossSection, MaterialType, PieceCondition, StructuralMemberType } from '@/db/types';

export interface MemberInput {
  id?: string;
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
}

export interface PanelRequirement {
  id: string;
  memberId: string;
  label: string;
  memberType: StructuralMemberType;
  materialType: 'phenolic';
  length: number;
  width: number;
  quantity: number;
  exceedsStock: boolean;
}

export interface LumberRequirementInput {
  id: string;
  label: string;
  length: number;
  crossSection: CrossSection;
}

export interface MatchPiece {
  id: string;
  materialType: MaterialType;
  length: number;
  width: number;
  crossSection?: CrossSection;
  condition: PieceCondition;
  retired: boolean;
  usageCount?: number;
}

export interface MatchRequirement {
  id: string;
  materialType: MaterialType;
  label: string;
  length: number;
  width?: number;
  crossSection?: CrossSection;
}

export interface InventoryMatch {
  pieceId: string;
  piece: MatchPiece;
  requiresCutting: boolean;
  surplusArea: number;
  surplusMaxDimension: number;
}

export interface MatchGroup {
  requirement: MatchRequirement;
  candidates: InventoryMatch[];
  bestMatch: InventoryMatch | null;
}

export interface StockSize {
  length: number;
  width: number;
}

export interface PlywoodPanel {
  id: string;
  label?: string;
  length: number;
  width: number;
}

export type UnplacedReason = 'oversized';

export interface UnplacedPanel {
  panelId: string;
  label: string;
  length: number;
  width: number;
  reason: UnplacedReason;
}

export interface PlacedPanel {
  panelId: string;
  label: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export interface Offcut {
  x: number;
  y: number;
  length: number;
  width: number;
  reusable: boolean;
}

export interface PlywoodSheetPlan {
  sheetIndex: number;
  stock: StockSize;
  panels: PlacedPanel[];
  offcuts: Offcut[];
  usedArea: number;
  offcutArea: number;
  reusableOffcutArea: number;
  wasteArea: number;
  utilization: number;
  waste: number;
}

export interface PlywoodPlan {
  stock: StockSize;
  sheets: PlywoodSheetPlan[];
  sheetsUsed: number;
  naiveSheets: number;
  unplacedPanels: UnplacedPanel[];
  oversizedPanels: UnplacedPanel[];
  usedArea: number;
  stockArea: number;
  offcutArea: number;
  reusableOffcutArea: number;
  wasteArea: number;
  utilization: number;
  waste: number;
}

export interface LumberCut {
  requirementId: string;
  label: string;
  length: number;
  position: number;
}

export interface LumberStockPlan {
  stockIndex: number;
  crossSection: CrossSection;
  stockLength: number;
  cuts: LumberCut[];
  usedLength: number;
  offcutLength: number;
  utilization: number;
  waste: number;
}

export interface LumberUnplaced {
  requirementId: string;
  label: string;
  length: number;
  crossSection: CrossSection;
  reason: 'oversized';
}

export interface LumberGroupPlan {
  crossSection: CrossSection;
  stocks: LumberStockPlan[];
  stockPiecesUsed: number;
  totalStockLength: number;
  totalCutLength: number;
  totalOffcutLength: number;
  utilization: number;
  waste: number;
}

export interface LumberPlan {
  groups: LumberGroupPlan[];
  stocks: LumberStockPlan[];
  stockPiecesUsed: number;
  totalStockLength: number;
  totalCutLength: number;
  totalOffcutLength: number;
  utilization: number;
  waste: number;
  unplacedRequirements: LumberUnplaced[];
}

export interface PlywoodStats {
  sheetsUsed: number;
  naiveSheets: number;
  sheetsSaved: number;
  totalPanelArea: number;
  totalStockArea: number;
  utilization: number;
  waste: number;
  reusableOffcutArea: number;
  estimatedSavings: number;
}

export interface LumberStats {
  stockPiecesUsed: number;
  totalStockLength: number;
  totalCutLength: number;
  totalOffcutLength: number;
  utilization: number;
  waste: number;
  estimatedCost: number;
}

export interface CuttingStats {
  plywood: PlywoodStats;
  lumber: LumberStats;
  estimatedSavings: number;
}

export interface OptimizeInput {
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

export interface OptimizationResult {
  matches: MatchGroup[];
  remainingPanels: PanelRequirement[];
  remainingLumberRequirements: LumberRequirementInput[];
  plywood: PlywoodPlan;
  lumber: LumberPlan;
  stats: CuttingStats;
}
