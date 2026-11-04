import { declinedKey } from '@/db/workflow';
import type { InventoryMatch, MatchGroup } from '@/engine/types';

export type ReuseStatus = 'needsDecision' | 'satisfied' | 'newStock' | 'noMatch';

export const REUSE_STATUSES: readonly ReuseStatus[] = [
  'needsDecision',
  'satisfied',
  'newStock',
  'noMatch',
];

export const REUSE_STATUS_LABELS: Record<ReuseStatus, string> = {
  needsDecision: 'Needs decision',
  satisfied: 'Satisfied',
  newStock: 'New stock',
  noMatch: 'No match',
};

export interface RequirementReview {
  group: MatchGroup;
  status: ReuseStatus;
  acceptedPieceId?: string;
  availableCandidates: InventoryMatch[];
  declinedCandidates: InventoryMatch[];
  assignedElsewhereCount: number;
}

export interface ReviewSection {
  key: string;
  title: string;
  color?: string;
  reviews: RequirementReview[];
}

export function reviewRequirements(
  groups: readonly MatchGroup[],
  satisfiedRequirementIds: ReadonlySet<string>,
  acceptedByRequirement: ReadonlyMap<string, string>,
  declinedCandidates: ReadonlySet<string>,
  newStockRequirementIds: ReadonlySet<string>,
): RequirementReview[] {
  const assignedPieceIds = new Set(acceptedByRequirement.values());

  return groups.map((group) => {
    const requirementId = group.requirement.id;
    const acceptedPieceId = acceptedByRequirement.get(requirementId);
    const declined = group.candidates.filter((candidate) =>
      declinedCandidates.has(declinedKey(requirementId, candidate.pieceId)),
    );
    const assignedElsewhereCount = group.candidates.filter(
      (candidate) =>
        candidate.pieceId !== acceptedPieceId &&
        assignedPieceIds.has(candidate.pieceId) &&
        !declinedCandidates.has(declinedKey(requirementId, candidate.pieceId)),
    ).length;
    const available = group.candidates.filter((candidate) => {
      if (declinedCandidates.has(declinedKey(requirementId, candidate.pieceId))) {
        return false;
      }
      if (candidate.pieceId === acceptedPieceId) return true;
      return !assignedPieceIds.has(candidate.pieceId);
    });

    let status: ReuseStatus;
    if (satisfiedRequirementIds.has(requirementId)) {
      status = 'satisfied';
    } else if (newStockRequirementIds.has(requirementId)) {
      status = 'newStock';
    } else if (group.candidates.length === 0 || available.length === 0) {
      status = 'noMatch';
    } else {
      status = 'needsDecision';
    }

    return {
      group,
      status,
      acceptedPieceId,
      availableCandidates: available,
      declinedCandidates: declined,
      assignedElsewhereCount,
    };
  });
}

export function countReviews(
  reviews: readonly RequirementReview[],
): Record<ReuseStatus, number> {
  const counts: Record<ReuseStatus, number> = {
    needsDecision: 0,
    satisfied: 0,
    newStock: 0,
    noMatch: 0,
  };
  reviews.forEach((review) => {
    counts[review.status] += 1;
  });
  return counts;
}

export function decidedCount(reviews: readonly RequirementReview[]): number {
  return reviews.filter((review) => review.status !== 'needsDecision').length;
}

export function groupReviewsByMember(
  reviews: readonly RequirementReview[],
  memberColors: ReadonlyMap<string, string>,
): ReviewSection[] {
  const sections = new Map<string, ReviewSection>();

  reviews.forEach((review) => {
    const requirement = review.group.requirement;
    const memberKey = requirement.memberId || requirement.label;
    const key =
      requirement.materialType === 'lumber' ? 'lumber' : `member:${memberKey}`;
    const existing = sections.get(key);
    if (existing) {
      existing.reviews.push(review);
      return;
    }
    sections.set(key, {
      key,
      title:
        requirement.materialType === 'lumber' ? 'Lumber requirements' : requirement.label,
      color:
        requirement.materialType === 'lumber'
          ? undefined
          : memberColors.get(requirement.label),
      reviews: [review],
    });
  });

  return Array.from(sections.values());
}
