import { generateId } from '@/lib/ids';
import type { CuttingPlanRecord, JsonValue } from '@/db/types';
import type { CuttingPlanSnapshot, LatestCuttingPlan } from '@/db/plans';

let plans: CuttingPlanRecord[] = [];

function isJsonObject(value: unknown): value is { [key: string]: JsonValue } {
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

export function resetPlansMock(): void {
  plans = [];
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
  plans.push(record);
  return record;
}

export async function getLatestCuttingPlan(
  projectId: string,
): Promise<LatestCuttingPlan | null> {
  const records = plans.filter((plan) => plan.projectId === projectId);
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
