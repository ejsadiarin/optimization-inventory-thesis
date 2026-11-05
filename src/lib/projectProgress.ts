export interface ProjectProgressCounts {
  structuralMembers: number;
  lumberRequirements: number;
  pieces: number;
  requirements: number;
  decidedRequirements: number;
}

export interface ProjectNavAnnotation {
  complete?: boolean;
  count?: number;
}

export function buildNavAnnotations(
  counts: ProjectProgressCounts,
): Partial<Record<string, ProjectNavAnnotation>> {
  const annotations: Partial<Record<string, ProjectNavAnnotation>> = {};
  const outstanding = Math.max(
    counts.requirements - counts.decidedRequirements,
    0,
  );

  if (counts.structuralMembers > 0) {
    annotations.members = { complete: true };
  }
  if (counts.pieces > 0) {
    annotations.inventory = { complete: true };
  }
  if (counts.requirements > 0 && outstanding === 0) {
    annotations.planner = { complete: true };
  } else if (outstanding > 0) {
    annotations.planner = { count: outstanding };
  }

  return annotations;
}
