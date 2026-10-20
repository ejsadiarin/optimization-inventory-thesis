import { db } from './db';
import type { CuttingPlanRecord, JsonValue } from './types';
import { generateId } from '@/lib/ids';

export interface CuttingPlanSnapshot {
  satisfiedRequirementIds: string[];
  acceptedByRequirement: Record<string, string>;
}

export interface LatestCuttingPlan {
  id: string;
  projectId: string;
  createdAt: string;
  snapshot: CuttingPlanSnapshot;
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSnapshot(payload: JsonValue): CuttingPlanSnapshot | null {
  if (!isJsonObject(payload)) return null;

  const ids = payload.satisfiedRequirementIds;
  const accepted = payload.acceptedByRequirement;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null;
  if (!isJsonObject(accepted) || !Object.values(accepted).every((id) => typeof id === 'string')) {
    return null;
  }

  return {
    satisfiedRequirementIds: ids,
    acceptedByRequirement: accepted as Record<string, string>,
  };
}

export function filterCuttingPlanSnapshot(
  snapshot: CuttingPlanSnapshot,
  requirementIds: ReadonlySet<string>,
): CuttingPlanSnapshot {
  return {
    satisfiedRequirementIds: snapshot.satisfiedRequirementIds.filter((id) =>
      requirementIds.has(id),
    ),
    acceptedByRequirement: Object.fromEntries(
      Object.entries(snapshot.acceptedByRequirement).filter(([id]) =>
        requirementIds.has(id),
      ),
    ),
  };
}

export async function saveCuttingPlanSnapshot(
  projectId: string,
  snapshot: CuttingPlanSnapshot,
  createdAt = new Date().toISOString(),
): Promise<CuttingPlanRecord> {
  const record: CuttingPlanRecord = {
    id: generateId(),
    projectId,
    createdAt,
    payload: snapshot as unknown as JsonValue,
  };
  await db.cuttingPlans.add(record);
  return record;
}

export async function getLatestCuttingPlan(
  projectId: string,
): Promise<LatestCuttingPlan | null> {
  const records = await db.cuttingPlans.where('projectId').equals(projectId).toArray();
  if (records.length === 0) return null;

  const latest = records.reduce((current, record) =>
    Date.parse(record.createdAt) >= Date.parse(current.createdAt) ? record : current,
  );
  const snapshot = parseSnapshot(latest.payload);
  if (!snapshot) return null;

  return {
    id: latest.id,
    projectId: latest.projectId,
    createdAt: latest.createdAt,
    snapshot,
  };
}
