import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { offcutKey, type ReusableOffcutEntry } from '@/components/optimize/offcuts';
import type { RequirementReview } from '@/components/optimize/reuseReview';
import { useToast } from '@/components/ui/toast';
import { addPiece, listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import {
  emptyProjectPlan,
  getProjectPlan,
  saveProjectPlan,
  type ProjectPlan,
} from '@/db/plan';
import type { LumberRequirement, Project, StructuralMember } from '@/db/types';
import type {
  InventoryMatch,
  MatchGroup,
  MatchPiece,
  MatchRequirement,
} from '@/engine/types';
import { declinedKey } from '@/lib/candidateKeys';
import { canFitRequirementAlongside } from '@/lib/panelAssignments';
import { toMatchPiece } from '@/lib/pieces';
import {
  buildPlannerState,
  procurementSummary,
  reconcileProjectPlan,
  releaseAllocation,
  type MemberProjection,
  type PlannerState,
  type ProcurementSummary,
} from '@/lib/planner';
import { commitProjectPlan } from '@/lib/planCommit';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

export const PROJECT_LUMBER_ID = 'project-lumber';

export interface SharedPieceRequirementIds {
  draftRequirementIds: string[];
  committedRequirementIds: string[];
}

export interface BulkAcceptPreview {
  memberId: string;
  totalUndecided: number;
  acceptedCount: number;
  needsCuttingCount: number;
  unavailableCount: number;
  acceptances: Array<{ requirementId: string; pieceId: string }>;
}

export interface PlannerMemberView {
  memberId: string;
  memberLabel: string;
  projection: MemberProjection | undefined;
  reviews: RequirementReview[];
  isExclusive: boolean;
  exclusiveBlockedCount: number;
  sharedPieceRequirementIds: SharedPieceRequirementIds;
  totalRequirements: number;
  decidedRequirements: number;
}

export interface PlannerWorkspace {
  members: StructuralMember[];
  state: PlannerState;
  plan: ProjectPlan;
  loading: boolean;
  loadError: string;
  error: string;
  reload: () => Promise<void>;
  reportError: (message: string) => void;

  memberView: (memberId: string) => PlannerMemberView;
  projectLumberView: PlannerMemberView | null;
  memberColors: ReadonlyMap<string, string>;
  lockedRequirementIds: ReadonlySet<string>;
  hasResettableDecisions: boolean;
  statusLabel: string;

  accept: (group: MatchGroup, candidate: InventoryMatch) => void;
  decline: (group: MatchGroup, candidate: InventoryMatch) => void;
  restoreDeclined: (group: MatchGroup, candidate: InventoryMatch) => void;
  resetRequirement: (group: MatchGroup) => void;
  resetDecisions: () => void;
  release: (group: MatchGroup) => void;
  bulkAcceptPreview: (memberId: string) => BulkAcceptPreview;
  bulkAccept: (memberId: string) => void;

  exclusiveConfirmation: boolean;
  exclusiveError: string;
  requestExclusiveChange: (memberId: string, checked: boolean) => void;
  confirmExclusive: (memberId: string) => void;
  cancelExclusive: () => void;

  committing: boolean;
  canCommit: boolean;
  commit: () => Promise<void>;

  procurement: ProcurementSummary;
  reusableOffcuts: ReusableOffcutEntry[];
  selectedOffcutKeys: ReadonlySet<string>;
  addedOffcutKeys: ReadonlySet<string>;
  addingOffcuts: boolean;
  intakeError: string;
  toggleOffcut: (key: string, checked: boolean) => void;
  addOffcuts: () => Promise<void>;
}

function draftPlan(plan: ProjectPlan): ProjectPlan {
  return {
    ...plan,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
}

function withoutDecline(plan: ProjectPlan, key: string): ProjectPlan {
  return {
    ...plan,
    declinedCandidates: plan.declinedCandidates.filter((candidate) => candidate !== key),
  };
}

function resetRequirementPlan(
  plan: ProjectPlan,
  requirementId: string,
): ProjectPlan {
  const acceptedByRequirement = { ...plan.acceptedByRequirement };
  delete acceptedByRequirement[requirementId];
  return draftPlan({
    ...plan,
    acceptedByRequirement,
    declinedCandidates: plan.declinedCandidates.filter(
      (key) => !key.startsWith(`${requirementId}::`),
    ),
  });
}

function sharedPieceRequirementIds(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  acceptedByRequirement: Readonly<Record<string, string>>,
  memberId: string,
): SharedPieceRequirementIds {
  if (!memberId) {
    return { draftRequirementIds: [], committedRequirementIds: [] };
  }
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const membersByPiece = new Map<string, Set<string>>();
  for (const [requirementId, pieceId] of Object.entries(acceptedByRequirement)) {
    const requirementMemberId = requirementById.get(requirementId)?.memberId;
    if (!requirementMemberId) continue;
    const members = membersByPiece.get(pieceId) ?? new Set<string>();
    members.add(requirementMemberId);
    membersByPiece.set(pieceId, members);
  }
  const shared = Object.entries(acceptedByRequirement).filter(
    ([requirementId, pieceId]) =>
      requirementById.get(requirementId)?.memberId === memberId &&
      (membersByPiece.get(pieceId)?.size ?? 0) > 1,
  );
  return {
    draftRequirementIds: shared
      .map(([requirementId]) => requirementId)
      .filter((requirementId) => !(requirementId in plan.committedByRequirement)),
    committedRequirementIds: shared
      .map(([requirementId]) => requirementId)
      .filter((requirementId) => requirementId in plan.committedByRequirement),
  };
}

/**
 * Shared planner state and decision actions. The full project is always packed,
 * so member views are projections of one global allocation (ADR 0008).
 */
export function usePlannerWorkspace(project: Project): PlannerWorkspace {
  const { toast } = useToast();
  const refreshSignal = useRefreshSignal();
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [lumber, setLumber] = useState<LumberRequirement[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [plan, setPlan] = useState<ProjectPlan>(() => emptyProjectPlan());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [committing, setCommitting] = useState(false);
  const [selectedOffcutKeys, setSelectedOffcutKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [addedOffcutKeys, setAddedOffcutKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [addingOffcuts, setAddingOffcuts] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [exclusiveConfirmation, setExclusiveConfirmation] = useState(false);
  const [exclusiveError, setExclusiveError] = useState('');
  const dirtyPlanRef = useRef(false);
  const loadedOnceRef = useRef(false);

  const updatePlan = useCallback(
    (update: (current: ProjectPlan) => ProjectPlan) => {
      setPlan((current) => {
        const next = update(current);
        if (next === current) return current;
        dirtyPlanRef.current = true;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!dirtyPlanRef.current) return;
    dirtyPlanRef.current = false;
    void saveProjectPlan(project.id, plan);
  }, [plan, project.id]);

  const load = useCallback(async () => {
    if (!loadedOnceRef.current) setLoading(true);
    setLoadError('');
    try {
      const [loadedMembers, loadedLumber, inventoryPieces, storedPlan] =
        await Promise.all([
          listStructuralMembers(project.id),
          listLumberRequirements(project.id),
          listPieces(project.id),
          getProjectPlan(project.id),
        ]);
      const allPieces = inventoryPieces.map(toMatchPiece);
      const loadedPieces = allPieces.filter(
        (piece) => !piece.retired && piece.condition !== 'Retired',
      );
      const basePlan = storedPlan ?? emptyProjectPlan();
      const initialState = buildPlannerState({
        members: loadedMembers,
        lumber: loadedLumber,
        pieces: loadedPieces,
        stock: project.stock,
        costs: project.costs,
        plan: basePlan,
      });
      const { plan: reconciledPlan } = reconcileProjectPlan(
        basePlan,
        initialState.requirements,
        allPieces,
      );
      if (reconciledPlan !== basePlan) {
        await saveProjectPlan(project.id, reconciledPlan);
      }
      setMembers(loadedMembers);
      setLumber(loadedLumber);
      setPieces(loadedPieces);
      setPlan(reconciledPlan);
      loadedOnceRef.current = true;
    } catch {
      if (!loadedOnceRef.current) {
        setLoadError('Could not load planner data. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [project.id, project.stock, project.costs]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const state = useMemo(
    () =>
      buildPlannerState({
        members,
        lumber,
        pieces,
        stock: project.stock,
        costs: project.costs,
        plan,
      }),
    [members, lumber, pieces, project.stock, project.costs, plan],
  );

  const sharedPieceIdsByMember = useMemo(() => {
    const byMember = new Map<string, SharedPieceRequirementIds>();
    for (const member of members) {
      byMember.set(
        member.id,
        sharedPieceRequirementIds(
          plan,
          state.requirements,
          state.acceptedByRequirement,
          member.id,
        ),
      );
    }
    return byMember;
  }, [members, plan, state.requirements, state.acceptedByRequirement]);

  const memberView = useCallback(
    (memberId: string): PlannerMemberView => {
      const projection = state.memberProjections.get(memberId);
      const reviews = state.reviews.filter(
        (review) => review.group.requirement.memberId === memberId,
      );
      return {
        memberId,
        memberLabel:
          members.find((member) => member.id === memberId)?.label ?? '',
        projection,
        reviews,
        isExclusive: plan.exclusiveMemberIds.includes(memberId),
        exclusiveBlockedCount: reviews.reduce(
          (total, review) => total + review.exclusiveBlockedCount,
          0,
        ),
        sharedPieceRequirementIds:
          sharedPieceIdsByMember.get(memberId) ??
          sharedPieceRequirementIds(
            plan,
            state.requirements,
            state.acceptedByRequirement,
            memberId,
          ),
        totalRequirements: reviews.length,
        decidedRequirements: reviews.filter(
          (review) => review.status !== 'needsDecision',
        ).length,
      };
    },
    [state, plan, members, sharedPieceIdsByMember],
  );

  const projectLumberView = useMemo<PlannerMemberView | null>(() => {
    const reviews = state.reviews.filter(
      (review) => review.group.requirement.memberId === undefined,
    );
    if (reviews.length === 0) return null;
    return {
      memberId: PROJECT_LUMBER_ID,
      memberLabel: 'Project-level lumber',
      projection: undefined,
      reviews,
      isExclusive: false,
      exclusiveBlockedCount: 0,
      sharedPieceRequirementIds: {
        draftRequirementIds: [],
        committedRequirementIds: [],
      },
      totalRequirements: reviews.length,
      decidedRequirements: reviews.filter(
        (review) => review.status !== 'needsDecision',
      ).length,
    };
  }, [state.reviews]);

  const enableExclusive = useCallback(
    (memberId: string, releaseRequirementIds: readonly string[]) => {
      updatePlan((current) => {
        let next = current;
        for (const requirementId of releaseRequirementIds) {
          next = releaseAllocation(next, requirementId);
        }
        if (next.exclusiveMemberIds.includes(memberId)) return next;
        return draftPlan({
          ...next,
          exclusiveMemberIds: [...next.exclusiveMemberIds, memberId],
        });
      });
      setExclusiveConfirmation(false);
      setExclusiveError('');
    },
    [updatePlan],
  );

  const requestExclusiveChange = useCallback(
    (memberId: string, checked: boolean) => {
      if (!memberId) return;
      setExclusiveError('');
      if (!checked) {
        updatePlan((current) =>
          draftPlan({
            ...current,
            exclusiveMemberIds: current.exclusiveMemberIds.filter(
              (id) => id !== memberId,
            ),
          }),
        );
        setExclusiveConfirmation(false);
        return;
      }
      const view = memberView(memberId);
      const committedCount =
        view.sharedPieceRequirementIds.committedRequirementIds.length;
      if (committedCount > 0) {
        setExclusiveError(
          `${view.memberLabel || 'This member'} has ${committedCount} committed shared allocation${
            committedCount === 1 ? '' : 's'
          }. Release those locks before making this member exclusive.`,
        );
        return;
      }
      if (view.sharedPieceRequirementIds.draftRequirementIds.length > 0) {
        setExclusiveConfirmation(true);
        return;
      }
      enableExclusive(memberId, []);
    },
    [memberView, updatePlan, enableExclusive],
  );

  const confirmExclusive = useCallback(
    (memberId: string) => {
      if (!exclusiveConfirmation || !memberId) return;
      const draftRequirementIds =
        memberView(memberId).sharedPieceRequirementIds.draftRequirementIds;
      enableExclusive(memberId, draftRequirementIds);
    },
    [exclusiveConfirmation, memberView, enableExclusive],
  );

  const cancelExclusive = useCallback(() => {
    setExclusiveConfirmation(false);
  }, []);

  const memberColors = useMemo(
    () =>
      buildMemberColorMap(
        state.requirements
          .filter((requirement) => requirement.materialType === 'phenolic')
          .map((requirement) => requirement.label),
      ),
    [state.requirements],
  );

  const reusableOffcuts = useMemo<ReusableOffcutEntry[]>(
    () =>
      state.boards.flatMap((board) =>
        board.offcuts
          .filter((offcut) => offcut.reusable)
          .map((offcut) => ({
            key:
              board.source === 'reuse' && board.pieceId
                ? offcutKey(0, offcut, board.pieceId)
                : offcutKey(board.plan?.sheetIndex ?? 0, offcut),
            sheetIndex: board.plan?.sheetIndex ?? 0,
            offcut,
            ...(board.source === 'reuse' && board.pieceId
              ? { pieceId: board.pieceId }
              : {}),
          })),
      ),
    [state.boards],
  );

  const accept = useCallback(
    (group: MatchGroup, candidate: InventoryMatch) => {
      setError('');
      const requirementMemberId = group.requirement.memberId;
      const requirementsOnPiece = Object.entries(state.acceptedByRequirement)
        .filter(
          ([requirementId, pieceId]) =>
            requirementId !== group.requirement.id && pieceId === candidate.pieceId,
        )
        .map(([requirementId]) =>
          state.requirements.find((requirement) => requirement.id === requirementId),
        )
        .filter((requirement) => requirement !== undefined);

      if (
        requirementsOnPiece.some(
          (requirement) =>
            requirement.memberId &&
            plan.exclusiveMemberIds.includes(requirement.memberId),
        )
      ) {
        setError('That board is reserved for an exclusive member.');
        return;
      }
      if (
        requirementMemberId &&
        plan.exclusiveMemberIds.includes(requirementMemberId) &&
        requirementsOnPiece.some(
          (requirement) => requirement.memberId !== requirementMemberId,
        )
      ) {
        setError('This member is exclusive; shared boards are not available to it.');
        return;
      }

      if (
        !canFitRequirementAlongside(
          group.requirement,
          requirementsOnPiece,
          candidate.piece,
        )
      ) {
        setError('This board does not have enough remaining space for this panel.');
        return;
      }

      updatePlan((current) => ({
        ...draftPlan(current),
        acceptedByRequirement: {
          ...current.acceptedByRequirement,
          [group.requirement.id]: candidate.pieceId,
        },
      }));
    },
    [state, plan, updatePlan],
  );

  const decline = useCallback(
    (group: MatchGroup, candidate: InventoryMatch) => {
      const key = declinedKey(group.requirement.id, candidate.pieceId);
      updatePlan((current) =>
        current.declinedCandidates.includes(key)
          ? current
          : draftPlan({
              ...current,
              declinedCandidates: [...current.declinedCandidates, key],
            }),
      );
    },
    [updatePlan],
  );

  const restoreDeclined = useCallback(
    (group: MatchGroup, candidate: InventoryMatch) => {
      const key = declinedKey(group.requirement.id, candidate.pieceId);
      updatePlan((current) =>
        current.declinedCandidates.includes(key)
          ? draftPlan(withoutDecline(current, key))
          : current,
      );
    },
    [updatePlan],
  );

  const resetRequirement = useCallback(
    (group: MatchGroup) => {
      updatePlan((current) => resetRequirementPlan(current, group.requirement.id));
    },
    [updatePlan],
  );

  const resetDecisions = useCallback(() => {
    updatePlan((current) =>
      current.declinedCandidates.length === 0
        ? current
        : draftPlan({ ...current, declinedCandidates: [] }),
    );
  }, [updatePlan]);

  const release = useCallback(
    (group: MatchGroup) => {
      updatePlan((current) => releaseAllocation(current, group.requirement.id));
    },
    [updatePlan],
  );

  const bulkAcceptPreview = useCallback(
    (memberId: string): BulkAcceptPreview => {
      const undecided = state.reviews.filter(
        (review) =>
          review.group.requirement.memberId === memberId &&
          review.status === 'needsDecision',
      );
      const requirementById = new Map(
        state.requirements.map((requirement) => [requirement.id, requirement]),
      );
      const acceptedByRequirement = new Map(
        Object.entries(state.acceptedByRequirement),
      );
      const requirementsByPiece = new Map<string, MatchRequirement[]>();
      for (const [requirementId, pieceId] of acceptedByRequirement) {
        const requirement = requirementById.get(requirementId);
        if (!requirement) continue;
        const existing = requirementsByPiece.get(pieceId) ?? [];
        existing.push(requirement);
        requirementsByPiece.set(pieceId, existing);
      }

      const acceptances: BulkAcceptPreview['acceptances'] = [];
      let needsCuttingCount = 0;
      let unavailableCount = 0;

      for (const review of undecided) {
        const requirement = review.group.requirement;
        const top = review.availableCandidates[0];
        if (!top) {
          unavailableCount += 1;
          continue;
        }
        if (top.requiresCutting) {
          needsCuttingCount += 1;
          continue;
        }

        const candidate = review.availableCandidates.find((option) => {
          if (option.requiresCutting) return false;
          return canFitRequirementAlongside(
            requirement,
            requirementsByPiece.get(option.pieceId) ?? [],
            option.piece,
          );
        });
        if (!candidate) {
          unavailableCount += 1;
          continue;
        }

        acceptedByRequirement.set(requirement.id, candidate.pieceId);
        const existing = requirementsByPiece.get(candidate.pieceId) ?? [];
        existing.push(requirement);
        requirementsByPiece.set(candidate.pieceId, existing);
        acceptances.push({
          requirementId: requirement.id,
          pieceId: candidate.pieceId,
        });
      }

      return {
        memberId,
        totalUndecided: undecided.length,
        acceptedCount: acceptances.length,
        needsCuttingCount,
        unavailableCount,
        acceptances,
      };
    },
    [state],
  );

  const bulkAccept = useCallback(
    (memberId: string) => {
      const preview = bulkAcceptPreview(memberId);
      if (preview.acceptances.length === 0) return;
      updatePlan((current) =>
        draftPlan({
          ...current,
          acceptedByRequirement: {
            ...current.acceptedByRequirement,
            ...Object.fromEntries(
              preview.acceptances.map(({ requirementId, pieceId }) => [
                requirementId,
                pieceId,
              ]),
            ),
          },
        }),
      );
    },
    [bulkAcceptPreview, updatePlan],
  );

  const canCommit =
    !committing && state.reviews.length > 0 && state.counts.needsDecision === 0;

  const commit = useCallback(async () => {
    if (!canCommit) return;
    setCommitting(true);
    setError('');
    try {
      const next = await commitProjectPlan(project.id, plan, state);
      dirtyPlanRef.current = false;
      setPlan(next);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not commit the plan.',
      );
    } finally {
      setCommitting(false);
    }
  }, [canCommit, project.id, plan, state]);

  const toggleOffcut = useCallback((key: string, checked: boolean) => {
    setSelectedOffcutKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const addOffcuts = useCallback(async () => {
    const pending = reusableOffcuts.filter(
      (entry) => selectedOffcutKeys.has(entry.key) && !addedOffcutKeys.has(entry.key),
    );
    if (pending.length === 0) return;

    setAddingOffcuts(true);
    setIntakeError('');
    try {
      const dateAdded = new Date().toISOString();
      for (const entry of pending) {
        await addPiece({
          projectId: project.id,
          materialType: 'phenolic',
          length: entry.offcut.length,
          width: entry.offcut.width,
          thickness: project.stock.phenolic.thickness,
          condition: 'Good',
          dateAdded,
          source: 'Cut plan offcut',
        });
      }
      setAddedOffcutKeys(
        (current) => new Set([...current, ...pending.map((entry) => entry.key)]),
      );
      setSelectedOffcutKeys(new Set());
      toast({
        title: `Returned ${pending.length} offcut${pending.length === 1 ? '' : 's'} to inventory`,
        description: 'Added as Good with 0 uses. Available in the next planning session.',
        variant: 'success',
      });
      await load();
    } catch (caught) {
      setIntakeError(
        caught instanceof Error ? caught.message : 'Could not add offcuts to inventory.',
      );
    } finally {
      setAddingOffcuts(false);
    }
  }, [reusableOffcuts, selectedOffcutKeys, addedOffcutKeys, project, load, toast]);

  const statusLabel =
    plan.status === 'committed'
      ? 'Committed'
      : plan.status === 'needs_review'
        ? 'Needs review'
        : 'Plan draft';

  const procurement = useMemo(
    () =>
      procurementSummary(
        state.boards,
        state.optimization.stats.plywood.sheetsSaved,
      ),
    [state.boards, state.optimization.stats.plywood.sheetsSaved],
  );

  const lockedRequirementIds = useMemo(
    () => new Set(Object.keys(plan.committedByRequirement)),
    [plan.committedByRequirement],
  );

  return {
    members,
    state,
    plan,
    loading,
    loadError,
    error,
    reload: load,
    reportError: setError,
    memberView,
    projectLumberView,
    memberColors,
    lockedRequirementIds,
    hasResettableDecisions: plan.declinedCandidates.length > 0,
    statusLabel,
    accept,
    decline,
    restoreDeclined,
    resetRequirement,
    resetDecisions,
    release,
    bulkAcceptPreview,
    bulkAccept,
    exclusiveConfirmation,
    exclusiveError,
    requestExclusiveChange,
    confirmExclusive,
    cancelExclusive,
    committing,
    canCommit,
    commit,
    procurement,
    reusableOffcuts,
    selectedOffcutKeys,
    addedOffcutKeys,
    addingOffcuts,
    intakeError,
    toggleOffcut,
    addOffcuts,
  };
}
