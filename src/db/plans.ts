import { getDocs, setDoc } from 'firebase/firestore';
import {
  dataWithId,
  projectCollection,
  projectDoc,
  requireProjectId,
} from '@/lib/firestore-helpers';
import type { CuttingPlanRecord, JsonValue } from './types';
import { generateId } from '@/lib/ids';
import { queueWrite } from '@/lib/syncStatus';

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

// Firestore write promises only settle after the backend acknowledges them, so
// awaiting setDoc would hang while offline. The local cache applies the write
// immediately and the SDK flushes it on reconnect, so queue it in the
// background and return the record right away.
export async function saveCuttingPlanSnapshot(
  projectId: string,
  snapshot: CuttingPlanSnapshot,
  createdAt = new Date().toISOString(),
): Promise<CuttingPlanRecord> {
  const scopedProjectId = requireProjectId(projectId);
  const record: CuttingPlanRecord = {
    id: generateId(),
    projectId: scopedProjectId,
    createdAt,
    payload: snapshot as unknown as JsonValue,
  };
  queueWrite(setDoc(projectDoc(scopedProjectId, 'cuttingPlans', record.id), record));
  return record;
}

export async function getLatestCuttingPlan(
  projectId: string,
): Promise<LatestCuttingPlan | null> {
  const snapshot = await getDocs(
    projectCollection(requireProjectId(projectId), 'cuttingPlans'),
  );

  const records: CuttingPlanRecord[] = [];
  for (const document of snapshot.docs) {
    const record = dataWithId<CuttingPlanRecord>(document);
    if (record) records.push(record);
  }
  if (records.length === 0) return null;

  const latest = records.reduce((current, record) =>
    Date.parse(record.createdAt) >= Date.parse(current.createdAt) ? record : current,
  );
  const parsed = parseSnapshot(latest.payload);
  if (!parsed) return null;

  return {
    id: latest.id,
    projectId: latest.projectId,
    createdAt: latest.createdAt,
    snapshot: parsed,
  };
}
