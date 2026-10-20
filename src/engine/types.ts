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
  sourceMemberLabel: string;
  sourceMemberType: StructuralMemberType;
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
}

export interface MatchCandidate {
  pieceId: string;
  piece: MatchPiece;
  requiresCutting: boolean;
  surplusArea: number;
}

export interface MatchGroup {
  requirement: PanelRequirement | LumberRequirementInput;
  candidates: MatchCandidate[];
  bestMatch: MatchCandidate | null;
}

export interface StockSize {
  length: number;
  width: number;
}

export interface PlacedPanel {
  panelId: string;
  label: string;
  sourceMemberLabel: string;
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
  offcutLength: number;
  utilization: number;
}

export interface OptimizationStats {
  sheetsUsed: number;
  naiveSheets: number;
  sheetsSaved: number;
  utilization: number;
  waste: number;
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
}

export interface OptimizationResult {
  matches: MatchGroup[];
  unmatchedPanels: PanelRequirement[];
  plywoodPlans: PlywoodSheetPlan[];
  lumberPlans: LumberStockPlan[];
  reusableOffcuts: Offcut[];
  stats: OptimizationStats;
}
