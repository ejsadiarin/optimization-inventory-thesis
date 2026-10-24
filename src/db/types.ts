export type MaterialType = 'phenolic' | 'lumber';
export type PieceCondition = 'Good' | 'For Inspection' | 'Retired';
export type StructuralMemberType = 'column' | 'beam' | 'slab';
export type CrossSection = '2x2' | '2x3' | '2x4';

export const LUMBER_CROSS_SECTIONS: CrossSection[] = ['2x2', '2x3', '2x4'];

export interface ProjectCosts {
  phenolicPerSheet: number;
  lumberPerPiece: number;
}

export interface PhenolicStockSize {
  length: number;
  width: number;
}

export interface ProjectStock {
  phenolic: PhenolicStockSize;
  lumberLengths: number[];
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  schemaVersion: number;
  createdAt: string;
  costs: ProjectCosts;
  stock: ProjectStock;
}

export interface ProjectOwner {
  uid: string;
  name: string;
}

export interface CreatedProject {
  project: Project;
  accessCode: string;
}

export interface StructuralMember {
  id: string;
  projectId: string;
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface LumberRequirement {
  id: string;
  projectId: string;
  label: string;
  length: number;
  crossSection: CrossSection;
  createdAt: string;
}

export interface Piece {
  id: string;
  projectId: string;
  materialType: MaterialType;
  length: number;
  width: number;
  thickness: number;
  crossSection?: CrossSection;
  condition: PieceCondition;
  usageCount: number;
  storageLocation: string;
  dateAdded: string;
  retired: boolean;
  source: string;
}

export interface UsageLogEntry {
  id: string;
  pieceId: string;
  projectId: string;
  structuralMemberLabel: string;
  date: string;
  createdAt: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CuttingPlanRecord {
  id: string;
  projectId: string;
  createdAt: string;
  payload: JsonValue;
}
