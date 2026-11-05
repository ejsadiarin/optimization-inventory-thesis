import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import OffcutIntake from '@/components/optimize/OffcutIntake';
import { offcutKey, type ReusableOffcutEntry } from '@/components/optimize/offcuts';
import { SheetDiagram } from '@/components/optimize/CutPlanSheet';
import MatchGroups from '@/components/optimize/MatchGroups';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import {
  emptyProjectPlan,
  getProjectPlan,
  saveProjectPlan,
  type ProjectPlan,
} from '@/db/plan';
import { addPiece, listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import type {
  LumberRequirement,
  Project,
  StructuralMember,
} from '@/db/types';
import type { InventoryMatch, MatchGroup, MatchPiece } from '@/engine/types';
import { declinedKey } from '@/lib/candidateKeys';
import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { shortId } from '@/lib/format';
import {
  buildPlannerState,
  reconcileProjectPlan,
  releaseAllocation,
  type PlannerBoard,
} from '@/lib/planner';
import { commitProjectPlan } from '@/lib/planCommit';
import { canFitRequirementAlongside } from '@/lib/panelAssignments';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

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

function resetRequirement(plan: ProjectPlan, requirementId: string): ProjectPlan {
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

function boardMembers(board: PlannerBoard): string[] {
  return Array.from(
    new Set(
      board.panels.flatMap((panel) => (panel.memberLabel ? [panel.memberLabel] : [])),
    ),
  );
}

function BoardPreview({
  board,
  memberColors,
  highlightPanelIds,
  onExportSvg,
  onExportPng,
}: {
  board: PlannerBoard;
  memberColors: ReadonlyMap<string, string>;
  highlightPanelIds?: ReadonlySet<string>;
  onExportSvg?: (board: PlannerBoard) => void;
  onExportPng?: (board: PlannerBoard) => void;
}) {
  if (!board.plan) return null;
  const members = boardMembers(board);
  const title = board.pieceId
    ? shortId(board.pieceId)
    : `Stock sheet ${board.plan.sheetIndex + 1}`;
  return (
    <div
      className="space-y-2 rounded-md border p-3"
      data-testid={`planner-board-${board.key}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">
          {members.length > 0 ? members.join(' · ') : 'New stock'}
        </p>
      </div>
      <SheetDiagram
        sheet={board.plan}
        memberColors={memberColors}
        svgId={`planner-${board.key}`}
        highlightPanelIds={highlightPanelIds}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {board.source === 'reuse' ? 'Reused board' : 'New stock'} ·{' '}
          {board.panels.length} panel{board.panels.length === 1 ? '' : 's'} ·{' '}
          {board.plan.utilization.toFixed(0)}% used
        </p>
        {onExportSvg && onExportPng && (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Export ${title} as SVG`}
              onClick={() => onExportSvg(board)}
            >
              SVG
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Export ${title} as PNG`}
              onClick={() => onExportPng(board)}
            >
              PNG
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlannerScreen() {
  const project = useOutletContext<Project>();
  const { toast } = useToast();
  const refreshSignal = useRefreshSignal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [lumber, setLumber] = useState<LumberRequirement[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [plan, setPlan] = useState<ProjectPlan>(() => emptyProjectPlan());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [committing, setCommitting] = useState(false);
  const [selectedOffcutKeys, setSelectedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [addedOffcutKeys, setAddedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [addingOffcuts, setAddingOffcuts] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [confirmExclusive, setConfirmExclusive] = useState(false);
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

  const scope = searchParams.get('scope') === 'member' ? 'member' : 'project';
  const requestedMemberId = searchParams.get('member') ?? '';
  const selectedMemberId = members.some((member) => member.id === requestedMemberId)
    ? requestedMemberId
    : (members[0]?.id ?? '');
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const memberProjection =
    scope === 'member' && selectedMemberId
      ? state.memberProjections.get(selectedMemberId)
      : undefined;
  const isExclusive =
    selectedMemberId !== '' && plan.exclusiveMemberIds.includes(selectedMemberId);
  const memberSharedAssignments = useMemo(() => {
    if (!selectedMemberId) {
      return { draftRequirementIds: [] as string[], committedRequirementIds: [] as string[] };
    }
    const requirementById = new Map(
      state.requirements.map((requirement) => [requirement.id, requirement]),
    );
    const membersByPiece = new Map<string, Set<string>>();
    for (const [requirementId, pieceId] of Object.entries(state.acceptedByRequirement)) {
      const memberId = requirementById.get(requirementId)?.memberId;
      if (!memberId) continue;
      const members = membersByPiece.get(pieceId) ?? new Set<string>();
      members.add(memberId);
      membersByPiece.set(pieceId, members);
    }
    const shared = Object.entries(state.acceptedByRequirement).filter(
      ([requirementId, pieceId]) =>
        requirementById.get(requirementId)?.memberId === selectedMemberId &&
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
  }, [
    selectedMemberId,
    state.requirements,
    state.acceptedByRequirement,
    plan.committedByRequirement,
  ]);
  const visibleReviews =
    scope === 'project'
      ? state.reviews
      : state.reviews.filter(
          (review) => review.group.requirement.memberId === selectedMemberId,
        );
  const exclusiveBlockedTotal = visibleReviews.reduce(
    (total, review) => total + review.exclusiveBlockedCount,
    0,
  );
  const visibleBoards = useMemo(
    () => (scope === 'project' ? state.boards : (memberProjection?.boards ?? [])),
    [scope, state.boards, memberProjection],
  );

  function changeScope(nextScope: 'project' | 'member') {
    const next = new URLSearchParams(searchParams);
    if (nextScope === 'project') {
      next.delete('scope');
      next.delete('member');
    } else {
      next.set('scope', 'member');
      if (!next.get('member') && members[0]) {
        next.set('member', members[0].id);
      }
    }
    setSearchParams(next, { replace: true });
  }

  function changeMember(memberId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('scope', 'member');
    next.set('member', memberId);
    setSearchParams(next, { replace: true });
  }

  function enableExclusive(releaseRequirementIds: readonly string[]) {
    updatePlan((current) => {
      let next = current;
      for (const requirementId of releaseRequirementIds) {
        next = releaseAllocation(next, requirementId);
      }
      if (next.exclusiveMemberIds.includes(selectedMemberId)) return next;
      return draftPlan({
        ...next,
        exclusiveMemberIds: [...next.exclusiveMemberIds, selectedMemberId],
      });
    });
    setConfirmExclusive(false);
    setExclusiveError('');
  }

  function disableExclusive() {
    updatePlan((current) =>
      draftPlan({
        ...current,
        exclusiveMemberIds: current.exclusiveMemberIds.filter(
          (memberId) => memberId !== selectedMemberId,
        ),
      }),
    );
    setConfirmExclusive(false);
    setExclusiveError('');
  }

  function handleExclusiveChange(checked: boolean) {
    if (!selectedMemberId) return;
    setExclusiveError('');
    if (!checked) {
      disableExclusive();
      return;
    }
    if (memberSharedAssignments.committedRequirementIds.length > 0) {
      setExclusiveError(
        `${selectedMember?.label ?? 'This member'} has ${
          memberSharedAssignments.committedRequirementIds.length
        } committed shared allocation${
          memberSharedAssignments.committedRequirementIds.length === 1 ? '' : 's'
        }. Release those locks before making this member exclusive.`,
      );
      return;
    }
    if (memberSharedAssignments.draftRequirementIds.length > 0) {
      setConfirmExclusive(true);
      return;
    }
    enableExclusive([]);
  }

  const memberColors = useMemo(
    () =>
      buildMemberColorMap(
        state.requirements
          .filter((requirement) => requirement.materialType === 'phenolic')
          .map((requirement) => requirement.label),
      ),
    [state.requirements],
  );

  const reusedBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'reuse'),
    [visibleBoards],
  );

  const newStockBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'new_stock'),
    [visibleBoards],
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

  function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
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
  }

  function handleDecline(group: MatchGroup, candidate: InventoryMatch) {
    const key = declinedKey(group.requirement.id, candidate.pieceId);
    updatePlan((current) =>
      current.declinedCandidates.includes(key)
        ? current
        : draftPlan({
            ...current,
            declinedCandidates: [...current.declinedCandidates, key],
          }),
    );
  }

  function handleRestoreDeclined(group: MatchGroup, candidate: InventoryMatch) {
    updatePlan((current) =>
      current.declinedCandidates.includes(
        declinedKey(group.requirement.id, candidate.pieceId),
      )
        ? draftPlan(withoutDecline(current, declinedKey(group.requirement.id, candidate.pieceId)))
        : current,
    );
  }

  function handleResetRequirement(group: MatchGroup) {
    updatePlan((current) => resetRequirement(current, group.requirement.id));
  }

  function handleResetDecisions() {
    updatePlan((current) =>
      current.declinedCandidates.length === 0
        ? current
        : draftPlan({ ...current, declinedCandidates: [] }),
    );
  }

  const hasResettableDecisions = plan.declinedCandidates.length > 0;
  const lockedRequirementIds = useMemo(
    () => new Set(Object.keys(plan.committedByRequirement)),
    [plan.committedByRequirement],
  );
  const statusLabel =
    plan.status === 'committed'
      ? 'Committed'
      : plan.status === 'needs_review'
        ? 'Needs review'
        : 'Plan draft';
  const commitDisabled =
    committing ||
    state.reviews.length === 0 ||
    state.counts.needsDecision > 0;
  const reviewedTotal =
    scope === 'project' ? state.counts.requirements : visibleReviews.length;
  const reviewedDecided =
    scope === 'project'
      ? state.counts.decided
      : visibleReviews.filter((review) => review.status !== 'needsDecision').length;
  const memberCoverage = memberProjection?.panelCoverage;

  async function handleCommit() {
    if (commitDisabled) return;
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
  }

  function handleRelease(group: MatchGroup) {
    updatePlan((current) => releaseAllocation(current, group.requirement.id));
  }

  function boardExportLabel(board: PlannerBoard): string {
    if (board.source === 'reuse' && board.pieceId) {
      return `reused-board-${shortId(board.pieceId)}`;
    }
    return `stock-sheet-${(board.plan?.sheetIndex ?? 0) + 1}`;
  }

  function exportBoard(board: PlannerBoard, extension: 'svg' | 'png') {
    const element = document.getElementById(`planner-${board.key}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      setError('Could not find the cutting plan board to export.');
      return;
    }
    const filename = buildDatedFilename(
      project.name,
      boardExportLabel(board),
      extension,
    );
    const svg = element as unknown as SVGSVGElement;
    if (extension === 'svg') {
      downloadSvgAsFile(filename, svg);
      return;
    }
    void downloadSvgAsPng(filename, svg).catch(() => {
      setError('Could not export the cutting plan image.');
    });
  }

  function exportAllBoards(extension: 'svg' | 'png') {
    state.boards.forEach((board) => exportBoard(board, extension));
  }

  function toggleOffcut(key: string, checked: boolean) {
    setSelectedOffcutKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  async function handleAddOffcuts() {
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
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Planner"
        description={
          scope === 'project'
            ? 'Review every member and project-level requirement against the shared inventory.'
            : 'Review one member against the shared inventory without changing the allocation.'
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Planner scope"
          className="inline-flex rounded-md border p-0.5"
        >
          <Button
            type="button"
            size="sm"
            variant={scope === 'project' ? 'secondary' : 'ghost'}
            aria-pressed={scope === 'project'}
            onClick={() => changeScope('project')}
          >
            Project scope
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === 'member' ? 'secondary' : 'ghost'}
            aria-pressed={scope === 'member'}
            onClick={() => changeScope('member')}
          >
            Member scope
          </Button>
        </div>
        <Badge variant="outline">{statusLabel}</Badge>
        {plan.status === 'needs_review' && (
          <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
            Needs review
          </Badge>
        )}
      </div>

      {scope === 'member' && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="planner-member" className="text-sm font-medium">
            Structural member
          </label>
          <select
            id="planner-member"
            aria-label="Structural member"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={selectedMemberId}
            onChange={(event) => changeMember(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          {selectedMember && (
            <span className="text-sm text-muted-foreground">{selectedMember.label}</span>
          )}
        </div>
      )}

      {scope === 'member' && (
        <Card data-testid="planner-exclusive">
          <CardContent className="space-y-2 py-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                role="switch"
                aria-label="Exclusive member plan"
                checked={isExclusive}
                onChange={(event) => handleExclusiveChange(event.target.checked)}
              />
              <span className="font-medium">Exclusive member plan</span>
            </label>
            <p className="text-muted-foreground">
              Only reuse unshared inventory pieces. New-stock sheets may still mix
              members. Exclusivity can reduce utilization by giving up shared boards.
            </p>
            {isExclusive && exclusiveBlockedTotal > 0 && (
              <p
                role="status"
                data-testid="planner-exclusive-reason"
                className="text-amber-700"
              >
                {exclusiveBlockedTotal} shared board candidate
                {exclusiveBlockedTotal === 1 ? ' is' : 's are'} excluded by
                exclusivity. Panels without an unshared piece fall back to new stock.
              </p>
            )}
            {exclusiveError && (
              <p role="alert" className="font-medium text-destructive">
                {exclusiveError}
              </p>
            )}
            {confirmExclusive && (
              <div
                data-testid="planner-exclusive-confirm"
                className="space-y-2 rounded-md border border-amber-600/30 bg-amber-50 p-3 text-amber-900"
              >
                <p>
                  {selectedMember?.label ?? 'This member'} shares{' '}
                  {memberSharedAssignments.draftRequirementIds.length} draft board
                  {memberSharedAssignments.draftRequirementIds.length === 1 ? '' : 's'}{' '}
                  with other members. Making it exclusive releases those draft
                  assignments.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      enableExclusive(memberSharedAssignments.draftRequirementIds)
                    }
                  >
                    Make exclusive
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmExclusive(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {scope === 'project' && state.boards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => exportAllBoards('svg')}
          >
            Export all SVG
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => exportAllBoards('png')}
          >
            Export all PNG
          </Button>
        </div>
      )}

      {plan.invalidations.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-medium">Plan needs review</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {plan.invalidations.map((invalidation) => (
              <li key={invalidation.id}>{invalidation.message}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => void load()} />
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading planner…
        </div>
      ) : visibleReviews.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            scope === 'member'
              ? 'No requirements for this member'
              : 'No formwork requirements yet'
          }
          description={
            scope === 'member'
              ? 'Select another member or add requirements to this member.'
              : 'Add structural members or lumber requirements to start planning.'
          }
          action={
            <Button asChild>
              <Link to="../members">Add structural members</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p data-testid="planner-progress-summary">
                    <span className="font-medium">{reviewedDecided}</span> of{' '}
                    {reviewedTotal} requirements decided
                  </p>
                  {scope === 'project' ? (
                    <p className="text-muted-foreground">
                      {state.counts.reused} reused · {state.counts.newStock} new stock
                    </p>
                  ) : (
                    memberCoverage && (
                      <div className="space-y-0.5 text-muted-foreground">
                        <p data-testid="planner-member-coverage">
                          Panel coverage: {memberCoverage.reused} reused ·{' '}
                          {memberCoverage.newStock} new stock · {memberCoverage.unplaced}{' '}
                          unplaced
                        </p>
                        <p data-testid="planner-member-boards">
                          Served by {memberProjection.distinctBoardCount} board
                          {memberProjection.distinctBoardCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    )
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {scope === 'project' && hasResettableDecisions && (
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={handleResetDecisions}
                    >
                      Reset declines
                    </Button>
                  )}
                  {scope === 'project' && (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => void handleCommit()}
                      disabled={commitDisabled}
                      title={
                        state.counts.needsDecision > 0
                          ? 'Decide every requirement before committing'
                          : undefined
                      }
                    >
                      {committing
                        ? 'Committing…'
                        : plan.status === 'committed'
                          ? 'Re-commit plan'
                          : 'Commit plan'}
                    </Button>
                  )}
                </div>
              </div>
              <div
                role="progressbar"
                aria-label="Planner review progress"
                aria-valuemin={0}
                aria-valuemax={reviewedTotal}
                aria-valuenow={reviewedDecided}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${reviewedTotal > 0 ? Math.round((reviewedDecided / reviewedTotal) * 100) : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <MatchGroups
            reviews={visibleReviews}
            memberColors={memberColors}
            lockedRequirementIds={lockedRequirementIds}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onRestoreDeclined={handleRestoreDeclined}
            onResetRequirement={handleResetRequirement}
            onRelease={handleRelease}
          />

          {reusedBoards.length > 0 && (
            <Card data-testid="planner-reused-boards">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reused boards</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {reusedBoards.length} board{reusedBoards.length === 1 ? '' : 's'} in the
                  cutting plan. Shared boards show every member at once.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {reusedBoards.map((board) => (
                  <BoardPreview
                    key={board.key}
                    board={board}
                    memberColors={memberColors}
                    highlightPanelIds={
                      scope === 'member' ? memberProjection?.panelIds : undefined
                    }
                    onExportSvg={
                      scope === 'project' ? (item) => exportBoard(item, 'svg') : undefined
                    }
                    onExportPng={
                      scope === 'project' ? (item) => exportBoard(item, 'png') : undefined
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {newStockBoards.length > 0 && (
            <Card data-testid="planner-new-stock">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">New stock cutting plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {newStockBoards.map((board) => (
                  <BoardPreview
                    key={board.key}
                    board={board}
                    memberColors={memberColors}
                    highlightPanelIds={
                      scope === 'member' ? memberProjection?.panelIds : undefined
                    }
                    onExportSvg={
                      scope === 'project' ? (item) => exportBoard(item, 'svg') : undefined
                    }
                    onExportPng={
                      scope === 'project' ? (item) => exportBoard(item, 'png') : undefined
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {scope === 'project' && reusableOffcuts.length > 0 && (
            <div data-testid="planner-offcuts">
              <OffcutIntake
                reusableOffcuts={reusableOffcuts}
                selectedOffcutKeys={selectedOffcutKeys}
                addedOffcutKeys={addedOffcutKeys}
                addingOffcuts={addingOffcuts}
                intakeError={intakeError}
                onToggleOffcut={toggleOffcut}
                onAddOffcuts={() => void handleAddOffcuts()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
