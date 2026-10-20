import Dexie, { type EntityTable } from 'dexie';
import type {
  CuttingPlanRecord,
  LumberRequirement,
  Piece,
  Project,
  StructuralMember,
  UsageLogEntry,
} from './types';

export class AppDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  structuralMembers!: EntityTable<StructuralMember, 'id'>;
  lumberRequirements!: EntityTable<LumberRequirement, 'id'>;
  pieces!: EntityTable<Piece, 'id'>;
  usageLog!: EntityTable<UsageLogEntry, 'id'>;
  cuttingPlans!: EntityTable<CuttingPlanRecord, 'id'>;

  constructor(name = 'formwork-optimizer') {
    super(name);
    this.version(1).stores({
      projects: 'id, name, accessCode, createdAt',
      structuralMembers: 'id, projectId, type, createdAt',
      lumberRequirements: 'id, projectId, crossSection, createdAt',
      pieces: 'id, projectId, materialType, condition, dateAdded',
      usageLog: 'id, pieceId, projectId, date',
      cuttingPlans: 'id, projectId, createdAt',
    });
  }
}

export const db = new AppDatabase();
