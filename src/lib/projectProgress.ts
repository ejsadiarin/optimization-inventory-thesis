export interface ProjectProgressCounts {
  structuralMembers: number;
  lumberRequirements: number;
  pieces: number;
  requirements: number;
  decidedRequirements: number;
  reuseReviewed: boolean;
  cutPlansReviewedAt: string | null;
}

export type ProjectChecklistId =
  | 'members'
  | 'lumber'
  | 'inventory'
  | 'reuse'
  | 'cuts';

export interface ProjectChecklistItem {
  id: ProjectChecklistId;
  label: string;
  description: string;
  path: string;
  optional: boolean;
  complete: boolean;
}

export interface ProjectNavAnnotation {
  complete?: boolean;
  count?: number;
}

export interface ProjectNextAction {
  label: string;
  path: string;
}

const CHECKLIST_DEFINITIONS: ReadonlyArray<
  Omit<ProjectChecklistItem, 'complete'>
> = [
  {
    id: 'members',
    label: 'Structural members',
    description: 'Define columns, beams, and slabs.',
    path: 'members',
    optional: false,
  },
  {
    id: 'lumber',
    label: 'Lumber requirements',
    description: 'Add walers, braces, joists, or cleats.',
    path: 'members',
    optional: true,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Log boards, offcuts, and lumber available for reuse.',
    path: 'inventory',
    optional: true,
  },
  {
    id: 'reuse',
    label: 'Reuse decisions',
    description: 'Review matches; unmatched requirements fall back to new stock.',
    path: 'optimize?step=reuse',
    optional: false,
  },
  {
    id: 'cuts',
    label: 'Cut plans',
    description: 'Review sheet layouts and return reusable offcuts.',
    path: 'optimize?step=cuts',
    optional: false,
  },
];

function isComplete(id: ProjectChecklistId, counts: ProjectProgressCounts): boolean {
  switch (id) {
    case 'members':
      return counts.structuralMembers > 0;
    case 'lumber':
      return counts.lumberRequirements > 0;
    case 'inventory':
      return counts.pieces > 0;
    case 'reuse':
      return (
        counts.reuseReviewed &&
        counts.requirements > 0 &&
        counts.decidedRequirements >= counts.requirements
      );
    case 'cuts':
      return counts.cutPlansReviewedAt !== null;
  }
}

export function buildProjectChecklist(
  counts: ProjectProgressCounts,
): ProjectChecklistItem[] {
  return CHECKLIST_DEFINITIONS.map((item) => ({
    ...item,
    complete: isComplete(item.id, counts),
  }));
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
  if (
    counts.reuseReviewed &&
    counts.requirements > 0 &&
    outstanding === 0
  ) {
    annotations.optimize = { complete: true };
  } else if (outstanding > 0) {
    annotations.optimize = { count: outstanding };
  }

  return annotations;
}

export function getNextProjectAction(
  counts: ProjectProgressCounts,
): ProjectNextAction | null {
  if (counts.structuralMembers === 0) {
    return { label: 'Start with members', path: 'members' };
  }
  if (
    !counts.reuseReviewed ||
    counts.requirements === 0 ||
    counts.decidedRequirements < counts.requirements
  ) {
    return { label: 'Review reuse decisions', path: 'optimize?step=reuse' };
  }
  if (counts.cutPlansReviewedAt === null) {
    return { label: 'Review cut plans', path: 'optimize?step=cuts' };
  }
  return null;
}
