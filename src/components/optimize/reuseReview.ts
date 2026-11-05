import { declinedKey } from '@/lib/candidateKeys';
import { canFitRequirementAlongside } from '@/lib/panelAssignments';
import type {
  InventoryMatch,
  MatchGroup,
  MatchRequirement,
} from '@/engine/types';

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
  sharedPieceCandidateIds: string[];
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
): RequirementReview[] {
  const requirementById = new Map(
    groups.map((group) => [group.requirement.id, group.requirement]),
  );
  const assignedPieceIds = new Set(acceptedByRequirement.values());
  const requirementsByPiece = new Map<string, MatchRequirement[]>();

  for (const [requirementId, pieceId] of acceptedByRequirement) {
    const requirement = requirementById.get(requirementId);
    if (!requirement) continue;
    const existing = requirementsByPiece.get(pieceId) ?? [];
    existing.push(requirement);
    requirementsByPiece.set(pieceId, existing);
  }

  return groups.map((group) => {
    const requirementId = group.requirement.id;
    const acceptedPieceId = acceptedByRequirement.get(requirementId);
    const declined = group.candidates.filter((candidate) =>
      declinedCandidates.has(declinedKey(requirementId, candidate.pieceId)),
    );
    let assignedElsewhereCount = 0;
    const sharedPieceCandidateIds: string[] = [];
    const available = group.candidates.filter((candidate) => {
      if (declinedCandidates.has(declinedKey(requirementId, candidate.pieceId))) {
        return false;
      }
      if (candidate.pieceId === acceptedPieceId) return true;

      const existing = (requirementsByPiece.get(candidate.pieceId) ?? []).filter(
        (requirement) => requirement.id !== requirementId,
      );
      if (existing.length === 0) {
        // A piece assigned to a requirement that is no longer in the group
        // list still occupies the piece; conservatively treat it as unavailable.
        if (assignedPieceIds.has(candidate.pieceId)) {
          assignedElsewhereCount += 1;
          return false;
        }
        return true;
      }

      if (
        canFitRequirementAlongside(
          group.requirement,
          existing,
          candidate.piece,
        )
      ) {
        sharedPieceCandidateIds.push(candidate.pieceId);
        return true;
      }

      assignedElsewhereCount += 1;
      return false;
    });

    let status: ReuseStatus;
    if (satisfiedRequirementIds.has(requirementId)) {
      status = 'satisfied';
    } else if (available.length > 0) {
      status = 'needsDecision';
    } else if (group.candidates.length === 0) {
      status = 'newStock';
    } else if (declined.length === group.candidates.length) {
      status = 'noMatch';
    } else {
      status = 'newStock';
    }

    return {
      group,
      status,
      acceptedPieceId,
      availableCandidates: available,
      declinedCandidates: declined,
      assignedElsewhereCount,
      sharedPieceCandidateIds,
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
