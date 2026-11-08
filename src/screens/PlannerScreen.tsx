import { useMemo } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import OffcutIntake from '@/components/optimize/OffcutIntake';
import { SheetDiagram } from '@/components/optimize/CutPlanSheet';
import MatchGroups from '@/components/optimize/MatchGroups';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Project } from '@/db/types';
import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { shortId } from '@/lib/format';
import type { PlannerBoard } from '@/lib/planner';
import { usePlannerWorkspace } from '@/lib/plannerWorkspace';

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
  const workspace = usePlannerWorkspace(project);
  const [searchParams, setSearchParams] = useSearchParams();
  const { members, state, plan, loading, loadError, error } = workspace;

  const scope = searchParams.get('scope') === 'member' ? 'member' : 'project';
  const requestedMemberId = searchParams.get('member') ?? '';
  const selectedMemberId = members.some((member) => member.id === requestedMemberId)
    ? requestedMemberId
    : (members[0]?.id ?? '');
  const selectedMemberView = selectedMemberId
    ? workspace.memberView(selectedMemberId)
    : undefined;
  const memberProjection =
    scope === 'member' ? selectedMemberView?.projection : undefined;
  const isExclusive = selectedMemberView?.isExclusive ?? false;
  const sharedPieceRequirementIds = selectedMemberView?.sharedPieceRequirementIds ?? {
    draftRequirementIds: [],
    committedRequirementIds: [],
  };
  const visibleReviews =
    scope === 'project' ? state.reviews : (selectedMemberView?.reviews ?? []);
  const exclusiveBlockedTotal =
    scope === 'member' ? (selectedMemberView?.exclusiveBlockedCount ?? 0) : 0;
  const isConfirmingExclusive = workspace.exclusiveConfirmation;
  const visibleBoards = useMemo(
    () =>
      scope === 'project'
        ? state.boards
        : (selectedMemberView?.projection?.boards ?? []),
    [scope, state.boards, selectedMemberView?.projection?.boards],
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

  function handleExclusiveChange(checked: boolean) {
    if (!selectedMemberId) return;
    workspace.requestExclusiveChange(selectedMemberId, checked);
  }

  const reusedBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'reuse'),
    [visibleBoards],
  );

  const newStockBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'new_stock'),
    [visibleBoards],
  );

  const commitDisabled = !workspace.canCommit;
  const reviewedTotal =
    scope === 'project'
      ? state.counts.requirements
      : (selectedMemberView?.totalRequirements ?? 0);
  const reviewedDecided =
    scope === 'project'
      ? state.counts.decided
      : (selectedMemberView?.decidedRequirements ?? 0);
  const memberCoverage = selectedMemberView?.projection?.panelCoverage;

  function boardExportLabel(board: PlannerBoard): string {
    if (board.source === 'reuse' && board.pieceId) {
      return `reused-board-${shortId(board.pieceId)}`;
    }
    return `stock-sheet-${(board.plan?.sheetIndex ?? 0) + 1}`;
  }

  function exportBoard(board: PlannerBoard, extension: 'svg' | 'png') {
    const element = document.getElementById(`planner-${board.key}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      workspace.reportError('Could not find the cutting plan board to export.');
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
      workspace.reportError('Could not export the cutting plan image.');
    });
  }

  function exportAllBoards(extension: 'svg' | 'png') {
    state.boards.forEach((board) => exportBoard(board, extension));
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
        <Badge variant="outline">{workspace.statusLabel}</Badge>
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
          {selectedMemberView && (
            <span className="text-sm text-muted-foreground">
              {selectedMemberView.memberLabel}
            </span>
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
            {workspace.exclusiveError && (
              <p role="alert" className="font-medium text-destructive">
                {workspace.exclusiveError}
              </p>
            )}
            {isConfirmingExclusive && (
              <div
                data-testid="planner-exclusive-confirm"
                className="space-y-2 rounded-md border border-amber-600/30 bg-amber-50 p-3 text-amber-900"
              >
                <p>
                  {selectedMemberView?.memberLabel ?? 'This member'} shares{' '}
                  {sharedPieceRequirementIds.draftRequirementIds.length} draft board
                  {sharedPieceRequirementIds.draftRequirementIds.length === 1
                    ? ''
                    : 's'}{' '}
                  with other members. Making it exclusive releases those draft
                  assignments.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => workspace.confirmExclusive(selectedMemberId)}
                  >
                    Make exclusive
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => workspace.cancelExclusive()}
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
        <ErrorState message={loadError} onRetry={() => void workspace.reload()} />
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
                          Served by {memberProjection?.distinctBoardCount ?? 0} board
                          {memberProjection?.distinctBoardCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    )
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {scope === 'project' && workspace.hasResettableDecisions && (
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => workspace.resetDecisions()}
                    >
                      Reset declines
                    </Button>
                  )}
                  {scope === 'project' && (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => void workspace.commit()}
                      disabled={commitDisabled}
                      title={
                        state.counts.needsDecision > 0
                          ? 'Decide every requirement before committing'
                          : undefined
                      }
                    >
                      {workspace.committing
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

          {scope === 'project' && state.boards.length > 0 && (
            <Card data-testid="planner-procurement">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Procurement summary</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {workspace.procurement.reusedBoards} reused ·{' '}
                  {workspace.procurement.newStockSheets} new stock
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Boards used</p>
                  <p className="font-medium">{workspace.procurement.boardsUsed}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sheets saved</p>
                  <p className="font-medium">{workspace.procurement.sheetsSaved}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Utilization</p>
                  <p className="font-medium">
                    {workspace.procurement.utilization.toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Waste</p>
                  <p className="font-medium">{workspace.procurement.waste.toFixed(0)}%</p>
                </div>
              </CardContent>
            </Card>
          )}

          <MatchGroups
            reviews={visibleReviews}
            memberColors={workspace.memberColors}
            lockedRequirementIds={workspace.lockedRequirementIds}
            onAccept={workspace.accept}
            onDecline={workspace.decline}
            onRestoreDeclined={workspace.restoreDeclined}
            onResetRequirement={workspace.resetRequirement}
            onRelease={workspace.release}
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
                    memberColors={workspace.memberColors}
                    highlightPanelIds={
                      scope === 'member'
                        ? selectedMemberView?.projection?.panelIds
                        : undefined
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
                    memberColors={workspace.memberColors}
                    highlightPanelIds={
                      scope === 'member'
                        ? selectedMemberView?.projection?.panelIds
                        : undefined
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

          {scope === 'project' && workspace.reusableOffcuts.length > 0 && (
            <div data-testid="planner-offcuts">
              <OffcutIntake
                reusableOffcuts={workspace.reusableOffcuts}
                selectedOffcutKeys={workspace.selectedOffcutKeys}
                addedOffcutKeys={workspace.addedOffcutKeys}
                addingOffcuts={workspace.addingOffcuts}
                intakeError={workspace.intakeError}
                onToggleOffcut={workspace.toggleOffcut}
                onAddOffcuts={() => void workspace.addOffcuts()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
