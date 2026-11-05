import type {
  LumberRequirement,
  ProjectCosts,
  ProjectStock,
  StructuralMember,
} from '@/db/types';
import type { ProjectPlan, PlanInvalidation, PlanPlacement } from '@/db/plan';
import { declinedKey } from '@/lib/candidateKeys';
import { formatMeters, shortId } from '@/lib/format';
import {
  allocationsForAssignments,
  canFitRequirementAlongside,
} from '@/lib/panelAssignments';
import { decomposeMember } from '@/engine/decompose';
import { optimizeProject, toMatchRequirements } from '@/engine';
import { matchInventory } from '@/engine/match';
import type {
  MatchGroup,
  MatchPiece,
  MatchRequirement,
  Offcut,
  OptimizationResult,
  PlywoodSheetPlan,
  ReuseAllocation,
  StockSize,
} from '@/engine/types';
import {
  decidedCount,
  reviewRequirements,
  type RequirementReview,
} from '@/components/optimize/reuseReview';

export interface PlannerPanel {
  panelId: string;
  requirementId: string;
  label: string;
  memberId?: string;
  memberLabel?: string;
  materialType: 'phenolic' | 'lumber';
}

export interface PlannerBoard {
  key: string;
  source: 'reuse' | 'new_stock';
  pieceId?: string;
  materialType: 'phenolic';
  stock: StockSize;
  panels: PlannerPanel[];
  plan: PlywoodSheetPlan | null;
  offcuts: Offcut[];
}

export interface MemberProjection {
  memberId: string;
  memberLabel: string;
  panelIds: Set<string>;
  boards: PlannerBoard[];
  panelCoverage: {
    total: number;
    reused: number;
    newStock: number;
    unplaced: number;
  };
  distinctBoardCount: number;
  reuseAllocations: ReuseAllocation[];
}

export interface PlannerCounts {
  requirements: number;
  decided: number;
  needsDecision: number;
  reused: number;
  newStock: number;
  unplaced: number;
}

export interface PlannerState {
  requirements: MatchRequirement[];
  pieces: MatchPiece[];
  groups: MatchGroup[];
  reviews: RequirementReview[];
  acceptedByRequirement: Record<string, string>;
  committedByRequirement: Record<string, string>;
  allocations: ReuseAllocation[];
  optimization: OptimizationResult;
  boards: PlannerBoard[];
  memberProjections: Map<string, MemberProjection>;
  counts: PlannerCounts;
}

interface PlannerInput {
  members: StructuralMember[];
  lumber: LumberRequirement[];
  pieces: MatchPiece[];
  stock: ProjectStock;
  costs: ProjectCosts;
  plan: ProjectPlan;
}

function requirementSnapshot(requirement: MatchRequirement) {
  return {
    length: requirement.length,
    ...(requirement.width !== undefined ? { width: requirement.width } : {}),
    ...(requirement.crossSection ? { crossSection: requirement.crossSection } : {}),
  };
}

function pieceSnapshot(piece: MatchPiece) {
  return {
    length: piece.length,
    width: piece.width,
    materialType: piece.materialType,
    retired: piece.retired || piece.condition === 'Retired',
  };
}

function requirementChanged(
  requirement: MatchRequirement,
  snapshot: ProjectPlan['requirementSnapshots'][string] | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    snapshot.length !== requirement.length ||
    (snapshot.width ?? undefined) !== (requirement.width ?? undefined) ||
    (snapshot.crossSection ?? undefined) !== (requirement.crossSection ?? undefined)
  );
}

function pieceChanged(
  piece: MatchPiece,
  snapshot: ProjectPlan['pieceSnapshots'][string] | undefined,
): boolean {
  if (!snapshot) return false;
  return (
    snapshot.length !== piece.length ||
    snapshot.width !== piece.width ||
    snapshot.materialType !== piece.materialType ||
    snapshot.retired !== (piece.retired || piece.condition === 'Retired')
  );
}

function usablePiece(piece: MatchPiece | undefined): piece is MatchPiece {
  return Boolean(piece && !piece.retired && piece.condition !== 'Retired');
}

function effectiveAcceptedByRequirement(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): Record<string, string> {
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const exclusive = new Set(plan.exclusiveMemberIds);
  const candidates = Object.entries(plan.acceptedByRequirement).filter(
    ([requirementId, pieceId]) => {
      const requirement = requirementById.get(requirementId);
      const piece = pieceById.get(pieceId);
      return Boolean(requirement && usablePiece(piece));
    },
  );

  const membersByPiece = new Map<string, Set<string>>();
  for (const [requirementId, pieceId] of candidates) {
    const requirement = requirementById.get(requirementId);
    if (!requirement?.memberId) continue;
    const members = membersByPiece.get(pieceId) ?? new Set<string>();
    members.add(requirement.memberId);
    membersByPiece.set(pieceId, members);
  }

  const allowed = candidates.filter(([requirementId, pieceId]) => {
    const requirement = requirementById.get(requirementId);
    if (!requirement) return false;
    if (!requirement.memberId || !exclusive.has(requirement.memberId)) return true;
    return (membersByPiece.get(pieceId)?.size ?? 0) <= 1;
  });

  const accepted: Record<string, string> = {};
  const phenolic = allowed.filter(([requirementId]) => {
    const requirement = requirementById.get(requirementId);
    return requirement?.materialType === 'phenolic';
  });
  const phenolicMap = new Map(phenolic);
  const allocations = allocationsForAssignments(
    phenolicMap,
    requirements,
    pieces,
  );
  for (const allocation of allocations) {
    for (const panelId of allocation.panelIds) {
      accepted[panelId] = allocation.pieceId;
    }
  }

  const lumber = allowed.filter(([requirementId]) => {
    const requirement = requirementById.get(requirementId);
    return requirement?.materialType === 'lumber';
  });
  const lumberPieces = new Set<string>();
  for (const [requirementId, pieceId] of lumber.sort(([a], [b]) => a.localeCompare(b))) {
    if (lumberPieces.has(pieceId)) continue;
    const requirement = requirementById.get(requirementId);
    const piece = pieceById.get(pieceId);
    if (!requirement || !piece) continue;
    if (canFitRequirementAlongside(requirement, [], piece)) {
      accepted[requirementId] = pieceId;
      lumberPieces.add(pieceId);
    }
  }

  return accepted;
}

function buildPanels(
  requirements: readonly MatchRequirement[],
  panels: ReturnType<typeof decomposeMember>,
  lumber: readonly LumberRequirement[],
): Map<string, PlannerPanel> {
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const lumberById = new Map(lumber.map((requirement) => [requirement.id, requirement]));
  const memberLabelByRequirement = new Map<string, string>();

  for (const panel of panels) {
    memberLabelByRequirement.set(panel.id, panel.label);
  }
  for (const requirement of lumber) {
    if (requirement.memberId) {
      const panel = panels.find((item) => item.memberId === requirement.memberId);
      if (panel) memberLabelByRequirement.set(requirement.id, panel.label);
    }
  }

  const result = new Map<string, PlannerPanel>();
  for (const requirement of requirements) {
    const lumberRequirement = lumberById.get(requirement.id);
    result.set(requirement.id, {
      panelId: requirement.id,
      requirementId: requirement.id,
      label: requirement.label,
      memberId: requirement.memberId ?? lumberRequirement?.memberId,
      memberLabel:
        memberLabelByRequirement.get(requirement.id) ??
        (requirement.memberId
          ? requirementById.get(requirement.id)?.label
          : undefined),
      materialType: requirement.materialType,
    });
  }
  return result;
}

function boardPanels(
  panelIds: readonly string[],
  panelById: ReadonlyMap<string, PlannerPanel>,
): PlannerPanel[] {
  return panelIds.flatMap((panelId) => {
    const panel = panelById.get(panelId);
    return panel ? [panel] : [];
  });
}

function boardsFor(
  allocations: readonly ReuseAllocation[],
  sheets: readonly PlywoodSheetPlan[],
  panelById: ReadonlyMap<string, PlannerPanel>,
): PlannerBoard[] {
  return [
    ...allocations.map((allocation) => ({
      key: `reuse:${allocation.pieceId}`,
      source: 'reuse' as const,
      pieceId: allocation.pieceId,
      materialType: 'phenolic' as const,
      stock: allocation.plan.stock,
      panels: boardPanels(allocation.plan.panels.map((panel) => panel.panelId), panelById),
      plan: allocation.plan,
      offcuts: allocation.plan.offcuts,
    })),
    ...sheets.map((sheet) => ({
      key: `stock:${sheet.sheetIndex}`,
      source: 'new_stock' as const,
      materialType: 'phenolic' as const,
      stock: sheet.stock,
      panels: boardPanels(sheet.panels.map((panel) => panel.panelId), panelById),
      plan: sheet,
      offcuts: sheet.offcuts,
    })),
  ];
}

export function buildPlannerState(input: PlannerInput): PlannerState {
  const panels = input.members.flatMap(decomposeMember);
  const lumberInputs = input.lumber.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    length: requirement.length,
    crossSection: requirement.crossSection,
    memberId: requirement.memberId,
  }));
  const requirements = toMatchRequirements(panels, lumberInputs);
  const acceptedByRequirement = effectiveAcceptedByRequirement(
    input.plan,
    requirements,
    input.pieces,
  );
  const satisfied = new Set(Object.keys(acceptedByRequirement));
  const groups = matchInventory(requirements, input.pieces);
  const reviews = reviewRequirements(
    groups,
    satisfied,
    new Map(Object.entries(acceptedByRequirement)),
    new Set(input.plan.declinedCandidates),
  );
  const optimization = optimizeProject({
    panels,
    lumberRequirements: lumberInputs,
    stock: input.stock,
    costs: input.costs,
    pieces: input.pieces,
    satisfiedRequirementIds: satisfied,
  });
  const allocations = allocationsForAssignments(
    new Map(Object.entries(acceptedByRequirement)),
    requirements,
    input.pieces,
  );
  const panelById = buildPanels(requirements, panels, input.lumber);
  const boards = boardsFor(allocations, optimization.plywood.sheets, panelById);
  const memberProjections = new Map<string, MemberProjection>();

  for (const member of input.members) {
    const memberPanels = panels.filter((panel) => panel.memberId === member.id);
    const panelIds = new Set(memberPanels.map((panel) => panel.id));
    const memberBoards = boards.filter((board) =>
      board.panels.some((panel) => panel.memberId === member.id),
    );
    const reused = memberBoards
      .filter((board) => board.source === 'reuse')
      .flatMap((board) => board.panels)
      .filter((panel) => panel.memberId === member.id).length;
    const newStock = memberBoards
      .filter((board) => board.source === 'new_stock')
      .flatMap((board) => board.panels)
      .filter((panel) => panel.memberId === member.id).length;
    const unplaced = optimization.plywood.unplacedPanels.filter((panel) =>
      panelIds.has(panel.panelId),
    ).length;

    memberProjections.set(member.id, {
      memberId: member.id,
      memberLabel: member.label,
      panelIds,
      boards: memberBoards,
      panelCoverage: {
        total: memberPanels.length,
        reused,
        newStock,
        unplaced,
      },
      distinctBoardCount: memberBoards.length,
      reuseAllocations: allocations.filter((allocation) =>
        allocation.panelIds.some((panelId) => panelIds.has(panelId)),
      ),
    });
  }

  const needsDecision = reviews.filter(
    (review) => review.status === 'needsDecision',
  ).length;

  return {
    requirements,
    pieces: [...input.pieces],
    groups,
    reviews,
    acceptedByRequirement,
    committedByRequirement: { ...input.plan.committedByRequirement },
    allocations,
    optimization,
    boards,
    memberProjections,
    counts: {
      requirements: requirements.length,
      decided: decidedCount(reviews),
      needsDecision,
      reused: satisfied.size,
      newStock: requirements.length - satisfied.size,
      unplaced:
        optimization.plywood.unplacedPanels.length +
        optimization.lumber.unplacedRequirements.length,
    },
  };
}

export function projectMemberBoards(
  boards: readonly PlannerBoard[],
  memberId: string,
): PlannerBoard[] {
  return boards.filter((board) =>
    board.panels.some((panel) => panel.memberId === memberId),
  );
}

export function panelCoverage(
  boards: readonly PlannerBoard[],
  memberId: string,
): MemberProjection['panelCoverage'] {
  const memberPanels = boards
    .flatMap((board) => board.panels)
    .filter((panel) => panel.memberId === memberId);
  const reused = boards
    .filter((board) => board.source === 'reuse')
    .flatMap((board) => board.panels)
    .filter((panel) => panel.memberId === memberId).length;
  const newStock = boards
    .filter((board) => board.source === 'new_stock')
    .flatMap((board) => board.panels)
    .filter((panel) => panel.memberId === memberId).length;

  return {
    total: memberPanels.length,
    reused,
    newStock,
    unplaced: Math.max(0, memberPanels.length - reused - newStock),
  };
}

export function distinctBoardCount(
  boards: readonly PlannerBoard[],
  memberId: string,
): number {
  return projectMemberBoards(boards, memberId).length;
}

export function releaseAllocation(
  plan: ProjectPlan,
  requirementId: string,
): ProjectPlan {
  if (
    !(requirementId in plan.acceptedByRequirement) &&
    !(requirementId in plan.committedByRequirement)
  ) {
    return plan;
  }

  const acceptedByRequirement = { ...plan.acceptedByRequirement };
  const committedByRequirement = { ...plan.committedByRequirement };
  delete acceptedByRequirement[requirementId];
  delete committedByRequirement[requirementId];

  const placements = { ...plan.placements };
  delete placements[requirementId];

  const stillUsedPieces = new Set(Object.values(committedByRequirement));
  const usageRecordedPieceIds = plan.usageRecordedPieceIds.filter((pieceId) =>
    stillUsedPieces.has(pieceId),
  );

  return {
    ...plan,
    status: plan.invalidations.length > 0 ? 'needs_review' : 'draft',
    acceptedByRequirement,
    committedByRequirement,
    placements,
    usageRecordedPieceIds,
    updatedAt: new Date().toISOString(),
  };
}

interface ReleaseReason {
  requirementId: string;
  pieceId?: string;
  kind: 'missing-requirement' | 'missing-piece' | 'retired-piece' | 'dimensions' | 'fit';
  label: string;
}

function releaseMessage(reason: ReleaseReason): PlanInvalidation {
  const label = reason.label;
  const suffix = reason.pieceId ? ` on board ${shortId(reason.pieceId)}` : '';
  const message =
    reason.kind === 'missing-requirement'
      ? `${label} no longer exists; allocation released.`
      : reason.kind === 'retired-piece'
        ? `Board ${shortId(reason.pieceId ?? '')} was retired; ${label} released.`
        : reason.kind === 'dimensions'
          ? `${label}${suffix} dimensions changed; allocation released.`
          : reason.kind === 'missing-piece'
            ? `Board ${shortId(reason.pieceId ?? '')} is missing; ${label} released.`
            : `Board ${shortId(reason.pieceId ?? '')} no longer fits ${label}; allocation released.`;

  return {
    id: `invalidation:${reason.kind}:${reason.requirementId}:${reason.pieceId ?? ''}`,
    message,
    requirementIds: [reason.requirementId],
    pieceIds: reason.pieceId ? [reason.pieceId] : [],
    createdAt: new Date().toISOString(),
  };
}

export function reconcileProjectPlan(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): { plan: ProjectPlan; invalidations: PlanInvalidation[] } {
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const exclusive = new Set(plan.exclusiveMemberIds);
  const reasons: ReleaseReason[] = [];

  const candidates = Object.entries(plan.committedByRequirement).filter(
    ([requirementId, pieceId]) => {
      const requirement = requirementById.get(requirementId);
      const piece = pieceById.get(pieceId);
      if (!requirement) {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'missing-requirement',
          label: requirementId,
        });
        return false;
      }
      if (!piece) {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'missing-piece',
          label: requirement.label,
        });
        return false;
      }
      if (piece.retired || piece.condition === 'Retired') {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'retired-piece',
          label: requirement.label,
        });
        return false;
      }
      if (requirementChanged(requirement, plan.requirementSnapshots[requirementId])) {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'dimensions',
          label: requirement.label,
        });
        return false;
      }
      if (pieceChanged(piece, plan.pieceSnapshots[pieceId])) {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'dimensions',
          label: requirement.label,
        });
        return false;
      }
      if (
        requirement.memberId &&
        exclusive.has(requirement.memberId) &&
        Object.entries(plan.committedByRequirement).some(
          ([otherRequirementId, otherPieceId]) =>
            otherPieceId === pieceId &&
            otherRequirementId !== requirementId &&
            requirementById.get(otherRequirementId)?.memberId !== requirement.memberId,
        )
      ) {
        reasons.push({
          requirementId,
          pieceId,
          kind: 'fit',
          label: requirement.label,
        });
        return false;
      }
      return true;
    },
  );

  const kept: Record<string, string> = {};
  const requirementsByPiece = new Map<string, MatchRequirement[]>();
  for (const [requirementId, pieceId] of candidates) {
    const requirement = requirementById.get(requirementId);
    const piece = pieceById.get(pieceId);
    if (!requirement || !piece) continue;
    const list = requirementsByPiece.get(pieceId) ?? [];
    list.push(requirement);
    requirementsByPiece.set(pieceId, list);
  }

  for (const [pieceId, group] of requirementsByPiece) {
    const piece = pieceById.get(pieceId);
    if (!piece) continue;
    if (piece.materialType === 'lumber') {
      const first = group.sort((a, b) => a.id.localeCompare(b.id))[0];
      if (first) kept[first.id] = pieceId;
      for (const requirement of group) {
        if (requirement.id !== first?.id) {
          reasons.push({
            requirementId: requirement.id,
            pieceId,
            kind: 'fit',
            label: requirement.label,
          });
        }
      }
      continue;
    }

    const accepted: MatchRequirement[] = [];
    for (const requirement of [...group].sort((a, b) => a.id.localeCompare(b.id))) {
      if (canFitRequirementAlongside(requirement, accepted, piece)) {
        accepted.push(requirement);
        kept[requirement.id] = pieceId;
      } else {
        reasons.push({
          requirementId: requirement.id,
          pieceId,
          kind: 'fit',
          label: requirement.label,
        });
      }
    }
  }

  const removed = Object.keys(plan.committedByRequirement).filter(
    (requirementId) => !(requirementId in kept),
  );
  if (removed.length === 0) return { plan, invalidations: [] };

  const acceptedByRequirement = { ...plan.acceptedByRequirement };
  const committedByRequirement = { ...plan.committedByRequirement };
  for (const requirementId of removed) {
    delete acceptedByRequirement[requirementId];
    delete committedByRequirement[requirementId];
  }

  const existingIds = new Set(plan.invalidations.map((item) => item.id));
  const invalidations = reasons
    .map(releaseMessage)
    .filter((item) => !existingIds.has(item.id));
  const placements = { ...plan.placements };
  for (const requirementId of removed) {
    delete placements[requirementId];
  }
  const usedPieces = new Set(Object.values(committedByRequirement));
  const usageRecordedPieceIds = plan.usageRecordedPieceIds.filter((pieceId) =>
    usedPieces.has(pieceId),
  );

  return {
    plan: {
      ...plan,
      status: 'needs_review',
      acceptedByRequirement,
      committedByRequirement,
      placements,
      usageRecordedPieceIds,
      invalidations: [...plan.invalidations, ...invalidations],
      updatedAt: new Date().toISOString(),
    },
    invalidations,
  };
}

export function committedPlacements(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): Record<string, PlanPlacement> {
  const allocations = allocationsForAssignments(
    new Map(Object.entries(plan.committedByRequirement)),
    requirements,
    pieces,
  );
  const placements: Record<string, PlanPlacement> = {};
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

export function requirementSnapshotsFor(
  requirements: readonly MatchRequirement[],
): ProjectPlan['requirementSnapshots'] {
  return Object.fromEntries(
    requirements.map((requirement) => [requirement.id, requirementSnapshot(requirement)]),
  );
}

export function pieceSnapshotsFor(
  pieces: readonly MatchPiece[],
): ProjectPlan['pieceSnapshots'] {
  return Object.fromEntries(pieces.map((piece) => [piece.id, pieceSnapshot(piece)]));
}

export function usageSummaryForPiece(
  pieceId: string,
  requirements: readonly MatchRequirement[],
  acceptedByRequirement: Readonly<Record<string, string>>,
): { requirementIds: string[]; requirementLabels: string[]; memberLabels: string[] } {
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const requirementIds = Object.entries(acceptedByRequirement)
    .filter(([, assignedPieceId]) => assignedPieceId === pieceId)
    .map(([requirementId]) => requirementId);
  const requirementLabels = requirementIds.flatMap((requirementId) => {
    const requirement = requirementById.get(requirementId);
    return requirement ? [requirement.label] : [];
  });
  const memberLabels = Array.from(
    new Set(
      requirementIds.flatMap((requirementId) => {
        const requirement = requirementById.get(requirementId);
        return requirement?.memberId ? [requirement.label] : [];
      }),
    ),
  );

  return { requirementIds, requirementLabels, memberLabels };
}

export function dimensionsLabel(
  requirement: Pick<MatchRequirement, 'length' | 'width' | 'crossSection'>,
): string {
  if (requirement.crossSection) {
    return `${formatMeters(requirement.length)} · ${requirement.crossSection}`;
  }
  return `${formatMeters(requirement.length)} × ${formatMeters(requirement.width ?? 0)}`;
}

export function declinedCandidatesSet(plan: ProjectPlan): Set<string> {
  return new Set(plan.declinedCandidates);
}

export function isDeclined(
  plan: ProjectPlan,
  requirementId: string,
  pieceId: string,
): boolean {
  return declinedCandidatesSet(plan).has(declinedKey(requirementId, pieceId));
}
