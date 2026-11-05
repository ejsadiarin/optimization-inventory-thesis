import { recordPlanUsage } from '@/db/inventory';
import { saveProjectPlan, type ProjectPlan } from '@/db/plan';
import {
  committedPlacements,
  pieceSnapshotsFor,
  reconcileProjectPlan,
  requirementSnapshotsFor,
  usageSummaryForPiece,
  type PlannerState,
} from './planner';

/**
 * Commits the effective project allocation. Usage is recorded before the plan
 * is saved so a failed usage write leaves the persisted plan uncommitted.
 */
export async function commitProjectPlan(
  projectId: string,
  plan: ProjectPlan,
  state: PlannerState,
): Promise<ProjectPlan> {
  if (state.requirements.length === 0) {
    throw new Error('Add requirements before committing the plan.');
  }
  if (state.reviews.some((review) => review.status === 'needsDecision')) {
    throw new Error('Decide every requirement before committing the plan.');
  }

  const reconciled = reconcileProjectPlan(
    plan,
    state.requirements,
    state.pieces,
  );
  if (reconciled.invalidations.length > 0) {
    throw new Error('Resolve the plan warnings before committing.');
  }

  const committedByRequirement = { ...state.acceptedByRequirement };
  const committedRequirementIds = new Set(Object.keys(committedByRequirement));
  const committedPieceIds = new Set(Object.values(committedByRequirement));

  const withCommitted = {
    ...reconciled.plan,
    committedByRequirement,
  };
  const newPieceIds = [...committedPieceIds].filter(
    (pieceId) => !reconciled.plan.usageRecordedPieceIds.includes(pieceId),
  );

  for (const pieceId of newPieceIds) {
    const usage = usageSummaryForPiece(
      pieceId,
      state.requirements,
      committedByRequirement,
    );
    const memberLabels =
      usage.memberLabels.length > 0 ? usage.memberLabels : ['Project'];
    await recordPlanUsage({
      pieceId,
      projectId,
      structuralMemberLabels: memberLabels,
      requirementIds: usage.requirementIds,
      requirementLabels: usage.requirementLabels,
    });
  }

  const now = new Date().toISOString();
  const next: ProjectPlan = {
    ...withCommitted,
    status: 'committed',
    acceptedByRequirement: committedByRequirement,
    committedByRequirement,
    placements: committedPlacements(
      withCommitted,
      state.requirements,
      state.pieces,
    ),
    requirementSnapshots: requirementSnapshotsFor(
      state.requirements.filter((requirement) =>
        committedRequirementIds.has(requirement.id),
      ),
    ),
    pieceSnapshots: pieceSnapshotsFor(
      state.pieces.filter((piece) => committedPieceIds.has(piece.id)),
    ),
    usageRecordedPieceIds: [
      ...reconciled.plan.usageRecordedPieceIds,
      ...newPieceIds,
    ],
    invalidations: [],
    committedAt: now,
    updatedAt: now,
  };

  await saveProjectPlan(projectId, next);
  return next;
}
