import type { ProjectPlan } from '@/db/plan';

let plans = new Map<string, ProjectPlan>();

function clone(plan: ProjectPlan): ProjectPlan {
  return {
    ...plan,
    acceptedByRequirement: { ...plan.acceptedByRequirement },
    committedByRequirement: { ...plan.committedByRequirement },
    declinedCandidates: [...plan.declinedCandidates],
    exclusiveMemberIds: [...plan.exclusiveMemberIds],
    placements: { ...plan.placements },
    requirementSnapshots: { ...plan.requirementSnapshots },
    pieceSnapshots: { ...plan.pieceSnapshots },
    usageRecordedPieceIds: [...plan.usageRecordedPieceIds],
    invalidations: plan.invalidations.map((invalidation) => ({
      ...invalidation,
      requirementIds: [...invalidation.requirementIds],
      pieceIds: [...invalidation.pieceIds],
    })),
  };
}

export function resetPlanMock(): void {
  plans = new Map();
}

export async function getProjectPlan(projectId: string): Promise<ProjectPlan | null> {
  const plan = plans.get(projectId);
  return plan ? clone(plan) : null;
}

export async function saveProjectPlan(
  projectId: string,
  plan: ProjectPlan,
): Promise<void> {
  plans.set(projectId, clone(plan));
}
