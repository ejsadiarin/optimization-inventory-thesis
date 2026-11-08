import { useMemo } from 'react';
import {
  Link,
  Navigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import { BoardPreview } from '@/components/optimize/BoardPreview';
import MatchGroups from '@/components/optimize/MatchGroups';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Project } from '@/db/types';
import { usePlannerWorkspace } from '@/lib/plannerWorkspace';

export default function PlannerScreen() {
  const project = useOutletContext<Project>();
  const workspace = usePlannerWorkspace(project);
  const [searchParams, setSearchParams] = useSearchParams();
  const { members, plan, loading, loadError, error } = workspace;

  const requestedMemberId = searchParams.get('member') ?? '';
  const selectedMemberId = members.some((member) => member.id === requestedMemberId)
    ? requestedMemberId
    : (members[0]?.id ?? '');
  const selectedMemberView = selectedMemberId
    ? workspace.memberView(selectedMemberId)
    : undefined;
  const isExclusive = selectedMemberView?.isExclusive ?? false;
  const sharedPieceRequirementIds = selectedMemberView?.sharedPieceRequirementIds ?? {
    draftRequirementIds: [],
    committedRequirementIds: [],
  };
  const reviews = selectedMemberView?.reviews ?? [];
  const exclusiveBlockedTotal = selectedMemberView?.exclusiveBlockedCount ?? 0;
  const visibleBoards = useMemo(
    () => selectedMemberView?.projection?.boards ?? [],
    [selectedMemberView?.projection?.boards],
  );
  const memberCoverage = selectedMemberView?.projection?.panelCoverage;

  const reusedBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'reuse'),
    [visibleBoards],
  );

  const newStockBoards = useMemo(
    () => visibleBoards.filter((board) => board.source === 'new_stock'),
    [visibleBoards],
  );

  if (searchParams.get('scope') === 'project') {
    return <Navigate to="../review" replace />;
  }

  function changeMember(memberId: string) {
    const next = new URLSearchParams(searchParams);
    next.delete('scope');
    next.set('member', memberId);
    setSearchParams(next, { replace: true });
  }

  function handleExclusiveChange(checked: boolean) {
    if (!selectedMemberId) return;
    workspace.requestExclusiveChange(selectedMemberId, checked);
  }

  const reviewedTotal = selectedMemberView?.totalRequirements ?? 0;
  const reviewedDecided = selectedMemberView?.decidedRequirements ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Planner"
        description="Review one member against the shared inventory without changing the allocation."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{workspace.statusLabel}</Badge>
        {plan.status === 'needs_review' && (
          <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
            Needs review
          </Badge>
        )}
      </div>

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
              {exclusiveBlockedTotal === 1 ? ' is' : 's are'} excluded by exclusivity.
              Panels without an unshared piece fall back to new stock.
            </p>
          )}
          {workspace.exclusiveError && (
            <p role="alert" className="font-medium text-destructive">
              {workspace.exclusiveError}
            </p>
          )}
          {workspace.exclusiveConfirmation && (
            <div
              data-testid="planner-exclusive-confirm"
              className="space-y-2 rounded-md border border-amber-600/30 bg-amber-50 p-3 text-amber-900"
            >
              <p>
                {selectedMemberView?.memberLabel ?? 'This member'} shares{' '}
                {sharedPieceRequirementIds.draftRequirementIds.length} draft board
                {sharedPieceRequirementIds.draftRequirementIds.length === 1 ? '' : 's'}{' '}
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
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No requirements for this member"
          description="Select another member or add requirements to this member."
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
              <div className="space-y-1 text-sm">
                <p data-testid="planner-progress-summary">
                  <span className="font-medium">{reviewedDecided}</span> of{' '}
                  {reviewedTotal} requirements decided
                </p>
                {memberCoverage && (
                  <div className="space-y-0.5 text-muted-foreground">
                    <p data-testid="planner-member-coverage">
                      Panel coverage: {memberCoverage.reused} reused ·{' '}
                      {memberCoverage.newStock} new stock · {memberCoverage.unplaced}{' '}
                      unplaced
                    </p>
                    <p data-testid="planner-member-boards">
                      Served by {selectedMemberView?.projection?.distinctBoardCount ?? 0}{' '}
                      board
                      {selectedMemberView?.projection?.distinctBoardCount === 1
                        ? ''
                        : 's'}
                    </p>
                  </div>
                )}
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
            reviews={reviews}
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
                  {reusedBoards.length} board{reusedBoards.length === 1 ? '' : 's'} in the
                  cutting plan. Shared boards show every member at once.
                </p>
              </div>
              {reusedBoards.map((board) => (
                <BoardPreview
                  key={board.key}
                  board={board}
                  memberColors={workspace.memberColors}
                  highlightPanelIds={selectedMemberView?.projection?.panelIds}
                />
              ))}
            </section>
          )}

          {newStockBoards.length > 0 && (
            <section data-testid="planner-new-stock" className="space-y-3">
              <h2 className="text-base font-semibold">New stock cutting plan</h2>
              {newStockBoards.map((board) => (
                <BoardPreview
                  key={board.key}
                  board={board}
                  memberColors={workspace.memberColors}
                  highlightPanelIds={selectedMemberView?.projection?.panelIds}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
