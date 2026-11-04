import { getDoc, setDoc } from 'firebase/firestore';
import { projectDoc, requireProjectId } from '@/lib/firestore-helpers';
import { queueWrite } from '@/lib/syncStatus';
import { matchInventory } from '@/engine/match';
import type { MatchPiece, MatchRequirement } from '@/engine/types';
import type { CuttingPlanSnapshot } from './plans';

export const OPTIMIZATION_WORKFLOW_SCHEMA_VERSION = 1;
export const OPTIMIZATION_WORKFLOW_ID = 'optimization';

export type OptimizationStep = 'reuse' | 'cuts';

export interface OptimizationWorkflow {
  satisfiedRequirementIds: string[];
  acceptedByRequirement: Record<string, string>;
  declinedCandidates: string[];
  newStockRequirementIds: string[];
  step: OptimizationStep;
  cutPlansReviewedAt: string | null;
  schemaVersion: number;
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

function parseWorkflow(data: unknown): OptimizationWorkflow {
  const record = isRecord(data) ? data : {};
  return {
    satisfiedRequirementIds: stringArray(record.satisfiedRequirementIds),
    acceptedByRequirement: stringRecord(record.acceptedByRequirement),
    declinedCandidates: stringArray(record.declinedCandidates),
    newStockRequirementIds: stringArray(record.newStockRequirementIds),
    step: record.step === 'cuts' ? 'cuts' : 'reuse',
    cutPlansReviewedAt:
      typeof record.cutPlansReviewedAt === 'string' ? record.cutPlansReviewedAt : null,
    schemaVersion:
      typeof record.schemaVersion === 'number'
        ? record.schemaVersion
        : OPTIMIZATION_WORKFLOW_SCHEMA_VERSION,
  };
}

export function emptyWorkflow(): OptimizationWorkflow {
  return {
    satisfiedRequirementIds: [],
    acceptedByRequirement: {},
    declinedCandidates: [],
    newStockRequirementIds: [],
    step: 'reuse',
    cutPlansReviewedAt: null,
    schemaVersion: OPTIMIZATION_WORKFLOW_SCHEMA_VERSION,
  };
}

export function workflowFromSnapshot(snapshot: CuttingPlanSnapshot): OptimizationWorkflow {
  return {
    ...emptyWorkflow(),
    satisfiedRequirementIds: [...snapshot.satisfiedRequirementIds],
    acceptedByRequirement: { ...snapshot.acceptedByRequirement },
  };
}

export function clearWorkflowDecisions(
  workflow: OptimizationWorkflow,
): OptimizationWorkflow {
  return {
    ...workflow,
    declinedCandidates: [],
    newStockRequirementIds: [],
  };
}

export function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}

export function restoreDeclinedCandidate(
  workflow: OptimizationWorkflow,
  key: string,
): OptimizationWorkflow {
  if (!workflow.declinedCandidates.includes(key)) return workflow;

  return {
    ...workflow,
    declinedCandidates: workflow.declinedCandidates.filter((candidate) => candidate !== key),
  };
}

export function resetRequirementDecisions(
  workflow: OptimizationWorkflow,
  requirementId: string,
): OptimizationWorkflow {
  const prefix = `${requirementId}::`;
  const declinedCandidates = workflow.declinedCandidates.filter(
    (key) => !key.startsWith(prefix),
  );
  const newStockRequirementIds = workflow.newStockRequirementIds.filter(
    (id) => id !== requirementId,
  );

  if (
    declinedCandidates.length === workflow.declinedCandidates.length &&
    newStockRequirementIds.length === workflow.newStockRequirementIds.length
  ) {
    return workflow;
  }

  return { ...workflow, declinedCandidates, newStockRequirementIds };
}

export function invalidateWorkflow(
  workflow: OptimizationWorkflow,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): OptimizationWorkflow {
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const acceptedByRequirement = { ...workflow.acceptedByRequirement };
  const existingSatisfied = workflow.satisfiedRequirementIds.filter((id) =>
    requirementById.has(id),
  );
  const satisfied = new Set(existingSatisfied);
  let changed = existingSatisfied.length !== workflow.satisfiedRequirementIds.length;

  for (const [requirementId, pieceId] of Object.entries(acceptedByRequirement)) {
    const requirement = requirementById.get(requirementId);
    const piece = pieceById.get(pieceId);
    const stillFits =
      requirement !== undefined &&
      piece !== undefined &&
      matchInventory([requirement], [piece])[0]?.candidates.length === 1;

    if (!stillFits) {
      delete acceptedByRequirement[requirementId];
      satisfied.delete(requirementId);
      changed = true;
    }
  }

  for (const id of Object.keys(acceptedByRequirement)) {
    if (!satisfied.has(id)) {
      satisfied.add(id);
      changed = true;
    }
  }

  const newStockRequirementIds = workflow.newStockRequirementIds.filter((id) =>
    requirementById.has(id),
  );
  if (newStockRequirementIds.length !== workflow.newStockRequirementIds.length) {
    changed = true;
  }

  if (!changed) return workflow;

  return {
    ...workflow,
    satisfiedRequirementIds: Array.from(satisfied),
    acceptedByRequirement,
    newStockRequirementIds,
  };
}

export async function getOptimizationWorkflow(
  projectId: string,
): Promise<OptimizationWorkflow | null> {
  const snapshot = await getDoc(
    projectDoc(requireProjectId(projectId), 'workflow', OPTIMIZATION_WORKFLOW_ID),
  );
  if (!snapshot.exists()) return null;
  return parseWorkflow(snapshot.data());
}

export async function saveOptimizationWorkflow(
  projectId: string,
  workflow: OptimizationWorkflow,
): Promise<void> {
  queueWrite(
    setDoc(
      projectDoc(requireProjectId(projectId), 'workflow', OPTIMIZATION_WORKFLOW_ID),
      workflow,
    ),
  );
}
