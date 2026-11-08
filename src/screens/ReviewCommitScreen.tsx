import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import { BoardPreview } from '@/components/optimize/BoardPreview';
import MatchGroups from '@/components/optimize/MatchGroups';
import OffcutIntake from '@/components/optimize/OffcutIntake';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Project } from '@/db/types';
import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { shortId } from '@/lib/format';
import type { PlannerBoard } from '@/lib/planner';
import { usePlannerWorkspace } from '@/lib/plannerWorkspace';

export default function ReviewCommitScreen() {
  const project = useOutletContext<Project>();
  const workspace = usePlannerWorkspace(project);
  const { state, plan, loading, loadError, error } = workspace;

  const reusedBoards = useMemo(
    () => state.boards.filter((board) => board.source === 'reuse'),
    [state.boards],
  );
  const newStockBoards = useMemo(
    () => state.boards.filter((board) => board.source === 'new_stock'),
    [state.boards],
  );

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
    <div className="space-y-5">
      <PageHeader
        title="Review & commit"
        description="Review the whole project allocation and commit the plan draft."
      />

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

      <div
        data-testid="review-commit-bar"
        className="sticky top-14 z-20 -mx-4 border-y bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            data-testid="planner-procurement"
            className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"
          >
            <span>
              <span className="text-muted-foreground">Boards used </span>
              <span className="font-medium">{workspace.procurement.boardsUsed}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Sheets saved </span>
              <span className="font-medium">{workspace.procurement.sheetsSaved}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Utilization </span>
              <span className="font-medium">
                {workspace.procurement.utilization.toFixed(0)}%
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Waste </span>
              <span className="font-medium">
                {workspace.procurement.waste.toFixed(0)}%
              </span>
            </span>
            <Badge variant="outline">{workspace.statusLabel}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {workspace.hasResettableDecisions && (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => workspace.resetDecisions()}
              >
                Reset declines
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => exportAllBoards('svg')}
              disabled={state.boards.length === 0}
            >
              Export all SVG
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => exportAllBoards('png')}
              disabled={state.boards.length === 0}
            >
              Export all PNG
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={() => void workspace.commit()}
              disabled={!workspace.canCommit}
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
          </div>
        </div>
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => void workspace.reload()} />
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading review…
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
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            <MatchGroups
              reviews={state.reviews}
              memberColors={workspace.memberColors}
              lockedRequirementIds={workspace.lockedRequirementIds}
              onAccept={workspace.accept}
              onDecline={workspace.decline}
              onRestoreDeclined={workspace.restoreDeclined}
              onResetRequirement={workspace.resetRequirement}
              onRelease={workspace.release}
            />

            {reusedBoards.length > 0 && (
              <section data-testid="planner-reused-boards" className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold">Reused boards</h2>
                  <p className="text-sm text-muted-foreground">
                    {reusedBoards.length} board
                    {reusedBoards.length === 1 ? '' : 's'} in the cutting plan.
                    Shared boards show every member at once.
                  </p>
                </div>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {reusedBoards.map((board) => (
                    <BoardPreview
                      key={board.key}
                      board={board}
                      memberColors={workspace.memberColors}
                      onExportSvg={(item) => exportBoard(item, 'svg')}
                      onExportPng={(item) => exportBoard(item, 'png')}
                    />
                  ))}
                </div>
              </section>
            )}

            {newStockBoards.length > 0 && (
              <section data-testid="planner-new-stock" className="space-y-3">
                <h2 className="text-base font-semibold">New stock cutting plan</h2>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {newStockBoards.map((board) => (
                    <BoardPreview
                      key={board.key}
                      board={board}
                      memberColors={workspace.memberColors}
                      onExportSvg={(item) => exportBoard(item, 'svg')}
                      onExportPng={(item) => exportBoard(item, 'png')}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="min-w-0 space-y-4">
            {workspace.reusableOffcuts.length > 0 && (
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
          </aside>
        </div>
      )}
    </div>
  );
}
