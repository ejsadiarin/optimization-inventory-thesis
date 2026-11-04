import { getDoc, setDoc } from 'firebase/firestore';
import { projectDoc, requireProjectId } from '@/lib/firestore-helpers';
import { queueWrite } from '@/lib/syncStatus';
import { matchInventory } from '@/engine/match';
import { packPanelsIntoStock } from '@/engine/plywood';
import { allocationsForAssignments } from '@/lib/panelAssignments';
import type { MatchPiece, MatchRequirement } from '@/engine/types';
import type { CuttingPlanSnapshot } from './plans';

export const OPTIMIZATION_WORKFLOW_SCHEMA_VERSION = 3;
export const OPTIMIZATION_WORKFLOW_ID = 'optimization';

export type OptimizationStep = 'reuse' | 'cuts';

export interface WorkflowPlacement {
  pieceId: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export type WorkflowPlacements = Record<string, WorkflowPlacement>;

export interface OptimizationWorkflow {
  satisfiedRequirementIds: string[];
  acceptedByRequirement: Record<string, string>;
  declinedCandidates: string[];
  step: OptimizationStep;
  cutPlansReviewedAt: string | null;
  schemaVersion: number;
  placements?: WorkflowPlacements;
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

function placementsRecord(value: unknown): WorkflowPlacements {
  if (!isRecord(value)) return {};

  const placements: WorkflowPlacements = {};
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
    placements[panelId] = {
      pieceId,
      x,
      y,
      length,
      width,
      rotated: raw.rotated,
    };
  }
  return placements;
}

function placementsEqual(
  left: WorkflowPlacements | undefined,
  right: WorkflowPlacements,
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((panelId) => {
    const a = left[panelId];
    const b = right[panelId];
    return (
      a !== undefined &&
      b !== undefined &&
      a.pieceId === b.pieceId &&
      a.x === b.x &&
      a.y === b.y &&
      a.length === b.length &&
      a.width === b.width &&
      a.rotated === b.rotated
    );
  });
}

/**
 * Rebuilds placements from the accepted requirement -> piece mapping. This is
 * also how v2 documents (which only stored the requirement -> piece mapping)
 * gain placement details.
 */
export function placementsForWorkflow(
  acceptedByRequirement: Readonly<Record<string, string>>,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): WorkflowPlacements {
  const placements: WorkflowPlacements = {};
  const allocations = allocationsForAssignments(
    new Map(Object.entries(acceptedByRequirement)),
    requirements,
    pieces,
  );

  for (const allocation of allocations) {
    for (const panel of allocation.plan.panels) {
      placements[panel.panelId] = {
        pieceId: allocation.pieceId,
        x: panel.x,
        y: panel.y,
        length: panel.length,
        width: panel.width,
        rotated: panel.rotated,
      };
    }
  }

  return placements;
}

export function parseWorkflow(data: unknown): OptimizationWorkflow {
  const record = isRecord(data) ? data : {};
  return {
    satisfiedRequirementIds: stringArray(record.satisfiedRequirementIds),
    acceptedByRequirement: stringRecord(record.acceptedByRequirement),
    declinedCandidates: stringArray(record.declinedCandidates),
    step: record.step === 'cuts' ? 'cuts' : 'reuse',
    cutPlansReviewedAt:
      typeof record.cutPlansReviewedAt === 'string' ? record.cutPlansReviewedAt : null,
    // Schema v2 stored the same requirement -> piece mapping, so it is read as
    // a v3 allocation document without a data migration. Missing placements are
    // derived from the mapping by invalidateWorkflow once pieces are available.
    schemaVersion: OPTIMIZATION_WORKFLOW_SCHEMA_VERSION,
    placements: placementsRecord(record.placements),
  };
}

export function emptyWorkflow(): OptimizationWorkflow {
  return {
    satisfiedRequirementIds: [],
    acceptedByRequirement: {},
    declinedCandidates: [],
    step: 'reuse',
    cutPlansReviewedAt: null,
    schemaVersion: OPTIMIZATION_WORKFLOW_SCHEMA_VERSION,
    placements: {},
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

  if (declinedCandidates.length === workflow.declinedCandidates.length) {
    return workflow;
  }

  return { ...workflow, declinedCandidates };
}

export function invalidateWorkflow(
  workflow: OptimizationWorkflow,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): OptimizationWorkflow {
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const acceptedEntries = Object.entries(workflow.acceptedByRequirement);
  const requirementsByPiece = new Map<string, MatchRequirement[]>();

  for (const [requirementId, pieceId] of acceptedEntries) {
    const requirement = requirementById.get(requirementId);
    const piece = pieceById.get(pieceId);
    if (!requirement || !piece) continue;
    if (piece.retired || piece.condition === 'Retired') continue;
    if (piece.materialType !== requirement.materialType) continue;

    const existing = requirementsByPiece.get(pieceId) ?? [];
    existing.push(requirement);
    requirementsByPiece.set(pieceId, existing);
  }

  const keptRequirementIds = new Set<string>();
  const placements: WorkflowPlacements = {};

  for (const [pieceId, assignedRequirements] of requirementsByPiece) {
    const piece = pieceById.get(pieceId);
    if (!piece) continue;

    if (piece.materialType === 'lumber') {
      for (const requirement of assignedRequirements) {
        if (
          !keptRequirementIds.has(requirement.id) &&
          matchInventory([requirement], [piece])[0]?.candidates.length === 1
        ) {
          keptRequirementIds.add(requirement.id);
        }
      }
      continue;
    }

    const panels = assignedRequirements
      .filter((requirement) => requirement.width !== undefined)
      .map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        length: requirement.length,
        width: requirement.width ?? 0,
      }));
    const packing = packPanelsIntoStock(panels, {
      length: piece.length,
      width: piece.width,
    });
    for (const panel of packing.plan.panels) {
      keptRequirementIds.add(panel.panelId);
      placements[panel.panelId] = {
        pieceId,
        x: panel.x,
        y: panel.y,
        length: panel.length,
        width: panel.width,
        rotated: panel.rotated,
      };
    }
  }

  const satisfiedRequirementIds = workflow.satisfiedRequirementIds.filter((id) =>
    keptRequirementIds.has(id),
  );
  for (const id of keptRequirementIds) {
    if (!satisfiedRequirementIds.includes(id)) satisfiedRequirementIds.push(id);
  }

  const acceptedChanged =
    keptRequirementIds.size !== acceptedEntries.length ||
    acceptedEntries.some(([requirementId]) => !keptRequirementIds.has(requirementId));
  const satisfiedChanged =
    satisfiedRequirementIds.length !== workflow.satisfiedRequirementIds.length ||
    satisfiedRequirementIds.some(
      (id, index) => id !== workflow.satisfiedRequirementIds[index],
    );
  const placementsChanged = !placementsEqual(workflow.placements, placements);

  if (!acceptedChanged && !satisfiedChanged && !placementsChanged) return workflow;

  return {
    ...workflow,
    satisfiedRequirementIds,
    acceptedByRequirement: Object.fromEntries(
      acceptedEntries.filter(([requirementId]) =>
        keptRequirementIds.has(requirementId),
      ),
    ),
    placements,
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
