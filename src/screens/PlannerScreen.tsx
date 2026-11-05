import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import { SheetDiagram } from '@/components/optimize/CutPlanSheet';
import MatchGroups from '@/components/optimize/MatchGroups';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  emptyProjectPlan,
  getProjectPlan,
  saveProjectPlan,
  type ProjectPlan,
} from '@/db/plan';
import { getActivePieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import type {
  LumberRequirement,
  Project,
  StructuralMember,
} from '@/db/types';
import type { InventoryMatch, MatchGroup, MatchPiece } from '@/engine/types';
import { declinedKey } from '@/lib/candidateKeys';
import { shortId } from '@/lib/format';
import { buildPlannerState, type PlannerBoard } from '@/lib/planner';
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
}: {
  board: PlannerBoard;
  memberColors: ReadonlyMap<string, string>;
}) {
  if (!board.plan) return null;
  const members = boardMembers(board);
  return (
    <div
      className="space-y-2 rounded-md border p-3"
      data-testid={`planner-board-${board.key}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold">
          {board.pieceId ? shortId(board.pieceId) : `Stock sheet ${board.plan.sheetIndex + 1}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {members.length > 0 ? members.join(' · ') : 'New stock'}
        </p>
      </div>
      <SheetDiagram
        sheet={board.plan}
        memberColors={memberColors}
        svgId={`planner-${board.key}`}
      />
      <p className="text-xs text-muted-foreground">
        {board.source === 'reuse' ? 'Reused board' : 'New stock'} ·{' '}
        {board.panels.length} panel{board.panels.length === 1 ? '' : 's'} ·{' '}
        {board.plan.utilization.toFixed(0)}% used
      </p>
    </div>
  );
}

export default function PlannerScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [lumber, setLumber] = useState<LumberRequirement[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [plan, setPlan] = useState<ProjectPlan>(() => emptyProjectPlan());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
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
          getActivePieces(project.id),
          getProjectPlan(project.id),
        ]);
      setMembers(loadedMembers);
      setLumber(loadedLumber);
      setPieces(inventoryPieces.map(toMatchPiece));
      setPlan(storedPlan ?? emptyProjectPlan());
      loadedOnceRef.current = true;
    } catch {
      if (!loadedOnceRef.current) {
        setLoadError('Could not load planner data. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [project.id]);

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
    () => state.boards.filter((board) => board.source === 'reuse'),
    [state.boards],
  );

  const newStockBoards = useMemo(
    () => state.boards.filter((board) => board.source === 'new_stock'),
    [state.boards],
  );

  function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
    setError('');
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Planner"
        description="Review every member and project-level requirement against the shared inventory."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Project scope</Badge>
        <Badge variant="outline">Plan draft</Badge>
      </div>

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
      ) : state.reviews.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No formwork requirements yet"
          description="Add structural members or lumber requirements to start planning."
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
                    <span className="font-medium">{state.counts.decided}</span> of{' '}
                    {state.counts.requirements} requirements decided
                  </p>
                  <p className="text-muted-foreground">
                    {state.counts.reused} reused · {state.counts.newStock} new stock
                  </p>
                </div>
                {hasResettableDecisions && (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={handleResetDecisions}
                  >
                    Reset declines
                  </Button>
                )}
              </div>
              <div
                role="progressbar"
                aria-label="Planner review progress"
                aria-valuemin={0}
                aria-valuemax={state.counts.requirements}
                aria-valuenow={state.counts.decided}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${Math.round(
                      (state.counts.decided / state.counts.requirements) * 100,
                    )}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <MatchGroups
            reviews={state.reviews}
            memberColors={memberColors}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onRestoreDeclined={handleRestoreDeclined}
            onResetRequirement={handleResetRequirement}
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
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
