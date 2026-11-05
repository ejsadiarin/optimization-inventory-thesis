import { getDoc, setDoc } from 'firebase/firestore';
import { projectDoc, requireProjectId } from '@/lib/firestore-helpers';
import { queueWrite } from '@/lib/syncStatus';
import type { CrossSection, MaterialType } from './types';

export const PROJECT_PLAN_SCHEMA_VERSION = 1;
export const PROJECT_PLAN_ID = 'planner';

export type PlanStatus = 'draft' | 'committed' | 'needs_review';

export interface PlanPlacement {
  pieceId: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export interface RequirementSnapshot {
  length: number;
  width?: number;
  crossSection?: CrossSection;
}

export interface PieceSnapshot {
  length: number;
  width: number;
  materialType: MaterialType;
  retired: boolean;
}

export interface PlanInvalidation {
  id: string;
  message: string;
  requirementIds: string[];
  pieceIds: string[];
  createdAt: string;
}

export interface ProjectPlan {
  schemaVersion: number;
  status: PlanStatus;
  acceptedByRequirement: Record<string, string>;
  committedByRequirement: Record<string, string>;
  declinedCandidates: string[];
  exclusiveMemberIds: string[];
  placements: Record<string, PlanPlacement>;
  requirementSnapshots: Record<string, RequirementSnapshot>;
  pieceSnapshots: Record<string, PieceSnapshot>;
  usageRecordedPieceIds: string[];
  invalidations: PlanInvalidation[];
  committedAt: string | null;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isCrossSection(value: unknown): value is CrossSection {
  return value === '2x2' || value === '2x3' || value === '2x4';
}

function parseStatus(value: unknown): PlanStatus {
  return value === 'committed' || value === 'needs_review' ? value : 'draft';
}

function parsePlacements(value: unknown): Record<string, PlanPlacement> {
  if (!isRecord(value)) return {};

  const placements: Record<string, PlanPlacement> = {};
  for (const [panelId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const pieceId = raw.pieceId;
    const x = finiteNumber(raw.x);
    const y = finiteNumber(raw.y);
    const length = finiteNumber(raw.length);
    const width = finiteNumber(raw.width);
    if (
      typeof pieceId !== 'string' ||
      x === null ||
      y === null ||
      length === null ||
      width === null ||
      typeof raw.rotated !== 'boolean'
    ) {
      continue;
    }
    placements[panelId] = { pieceId, x, y, length, width, rotated: raw.rotated };
  }
  return placements;
}

function parseRequirementSnapshots(value: unknown): Record<string, RequirementSnapshot> {
  if (!isRecord(value)) return {};

  const snapshots: Record<string, RequirementSnapshot> = {};
  for (const [requirementId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const length = finiteNumber(raw.length);
    if (length === null) continue;
    snapshots[requirementId] = {
      length,
      ...(typeof raw.width === 'number' && Number.isFinite(raw.width)
        ? { width: raw.width }
        : {}),
      ...(isCrossSection(raw.crossSection) ? { crossSection: raw.crossSection } : {}),
    };
  }
  return snapshots;
}

function parsePieceSnapshots(value: unknown): Record<string, PieceSnapshot> {
  if (!isRecord(value)) return {};

  const snapshots: Record<string, PieceSnapshot> = {};
  for (const [pieceId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const length = finiteNumber(raw.length);
    const width = finiteNumber(raw.width);
    if (
      length === null ||
      width === null ||
      (raw.materialType !== 'phenolic' && raw.materialType !== 'lumber') ||
      typeof raw.retired !== 'boolean'
    ) {
      continue;
    }
    snapshots[pieceId] = {
      length,
      width,
      materialType: raw.materialType,
      retired: raw.retired,
    };
  }
  return snapshots;
}

function parseInvalidations(value: unknown): PlanInvalidation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): PlanInvalidation[] => {
    if (!isRecord(raw)) return [];
    if (typeof raw.id !== 'string' || typeof raw.message !== 'string') return [];
    return [
      {
        id: raw.id,
        message: raw.message,
        requirementIds: stringArray(raw.requirementIds),
        pieceIds: stringArray(raw.pieceIds),
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
      },
    ];
  });
}

export function emptyProjectPlan(): ProjectPlan {
  return {
    schemaVersion: PROJECT_PLAN_SCHEMA_VERSION,
    status: 'draft',
    acceptedByRequirement: {},
    committedByRequirement: {},
    declinedCandidates: [],
    exclusiveMemberIds: [],
    placements: {},
    requirementSnapshots: {},
    pieceSnapshots: {},
    usageRecordedPieceIds: [],
    invalidations: [],
    committedAt: null,
    updatedAt: '',
  };
}

export function parseProjectPlan(data: unknown): ProjectPlan {
  const record = isRecord(data) ? data : {};
  return {
    schemaVersion: PROJECT_PLAN_SCHEMA_VERSION,
    status: parseStatus(record.status),
    acceptedByRequirement: stringRecord(record.acceptedByRequirement),
    committedByRequirement: stringRecord(record.committedByRequirement),
    declinedCandidates: stringArray(record.declinedCandidates),
    exclusiveMemberIds: stringArray(record.exclusiveMemberIds),
    placements: parsePlacements(record.placements),
    requirementSnapshots: parseRequirementSnapshots(record.requirementSnapshots),
    pieceSnapshots: parsePieceSnapshots(record.pieceSnapshots),
    usageRecordedPieceIds: stringArray(record.usageRecordedPieceIds),
    invalidations: parseInvalidations(record.invalidations),
    committedAt: typeof record.committedAt === 'string' ? record.committedAt : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
  };
}

export async function getProjectPlan(projectId: string): Promise<ProjectPlan | null> {
  const snapshot = await getDoc(
    projectDoc(requireProjectId(projectId), 'workflow', PROJECT_PLAN_ID),
  );
  if (!snapshot.exists()) return null;
  return parseProjectPlan(snapshot.data());
}

export async function saveProjectPlan(
  projectId: string,
  plan: ProjectPlan,
): Promise<void> {
  queueWrite(
    setDoc(
      projectDoc(requireProjectId(projectId), 'workflow', PROJECT_PLAN_ID),
      plan,
    ),
  );
}
