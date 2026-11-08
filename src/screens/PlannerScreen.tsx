import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import RequirementRows from '@/components/optimize/RequirementRows';
import MemberBoardViewer, {
  type CandidatePreviewState,
} from '@/components/optimize/MemberBoardViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Project, StructuralMemberType } from '@/db/types';
import { MEMBER_TYPE_LABELS } from '@/lib/memberLabels';
import {
  PROJECT_LUMBER_ID,
  usePlannerWorkspace,
} from '@/lib/plannerWorkspace';

type MemberTypeFilter = 'all' | StructuralMemberType;
type MemberStatusFilter = 'all' | 'needs-decision' | 'done';

const TYPE_FILTERS: Array<{ value: MemberTypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'column', label: 'Columns' },
  { value: 'beam', label: 'Beams' },
  { value: 'slab', label: 'Slabs' },
];

const STATUS_FILTERS: Array<{ value: MemberStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'needs-decision', label: 'Needs decision' },
  { value: 'done', label: 'Done' },
];

export default function PlannerScreen() {
  const project = useOutletContext<Project>();
  const workspace = usePlannerWorkspace(project);
  const [searchParams, setSearchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState<MemberTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('all');
  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [candidatePreview, setCandidatePreview] =
    useState<CandidatePreviewState | null>(null);
  const [confirmingBulkAccept, setConfirmingBulkAccept] = useState(false);
  const {
    members,
    plan,
    loading,
    loadError,
    error,
    memberView,
    projectLumberView,
    bulkAcceptPreview: previewBulkAccept,
  } = workspace;

  const memberViews = useMemo(
    () => members.map((member) => memberView(member.id)),
    [members, memberView],
  );
  const entryViews = useMemo(
    () =>
      projectLumberView ? [...memberViews, projectLumberView] : memberViews,
    [memberViews, projectLumberView],
  );
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  const requestedEntryId = searchParams.get('member') ?? '';
  const firstUndecided = entryViews.find(
    (view) => view.decidedRequirements < view.totalRequirements,
  );
  const fallbackEntryId =
    firstUndecided?.memberId ?? entryViews[0]?.memberId ?? '';
  // Pin the landing selection until the URL catches up. Decisions change which
  // entry is "first undecided", but the selection must not move by itself.
  const pinnedEntryIdRef = useRef('');
  if (!requestedEntryId && !pinnedEntryIdRef.current && fallbackEntryId) {
    pinnedEntryIdRef.current = fallbackEntryId;
  }
  const landingEntryId = pinnedEntryIdRef.current || fallbackEntryId;
  const selectedEntryId = entryViews.some(
    (view) => view.memberId === requestedEntryId,
  )
    ? requestedEntryId
    : landingEntryId;
  const selectedEntryView = entryViews.find(
    (view) => view.memberId === selectedEntryId,
  );
  const isProjectLumber = selectedEntryId === PROJECT_LUMBER_ID;

  useEffect(() => {
    if (
      loading ||
      !selectedEntryId ||
      requestedEntryId === selectedEntryId ||
      searchParams.get('scope') === 'project'
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('member', selectedEntryId);
    setSearchParams(next, { replace: true });
  }, [
    loading,
    requestedEntryId,
    searchParams,
    selectedEntryId,
    setSearchParams,
  ]);

  const isExclusive = selectedEntryView?.isExclusive ?? false;
  const sharedPieceRequirementIds = selectedEntryView?.sharedPieceRequirementIds ?? {
    draftRequirementIds: [],
    committedRequirementIds: [],
  };
  const reviews = selectedEntryView?.reviews ?? [];
  const exclusiveBlockedTotal = selectedEntryView?.exclusiveBlockedCount ?? 0;
  const bulkAcceptPreview = useMemo(
    () =>
      selectedEntryId && !isProjectLumber
        ? previewBulkAccept(selectedEntryId)
        : null,
    [isProjectLumber, selectedEntryId, previewBulkAccept],
  );
  const visibleBoards = useMemo(
    () => selectedEntryView?.projection?.boards ?? [],
    [selectedEntryView?.projection?.boards],
  );
  const memberCoverage = selectedEntryView?.projection?.panelCoverage;
  const selectedPlacementBoard = selectedRequirementId
    ? visibleBoards.find((board) =>
        board.panels.some((panel) => panel.panelId === selectedRequirementId),
      )
    : undefined;
  const focusedPanelId = selectedPlacementBoard
    ? selectedRequirementId
    : undefined;

  useEffect(() => {
    setCandidatePreview(null);
    setConfirmingBulkAccept(false);
  }, [selectedEntryId]);

  useEffect(() => {
    if (!selectedRequirementId) return;
    const row = document.querySelector(
      `[data-testid="requirement-row-${selectedRequirementId}"]`,
    );
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [loading, selectedEntryId, selectedRequirementId]);

  const filteredEntries = entryViews.filter((view) => {
    const isProjectEntry = view.memberId === PROJECT_LUMBER_ID;
    const member = memberById.get(view.memberId);
    if (
      !isProjectEntry &&
      typeFilter !== 'all' &&
      member?.type !== typeFilter
    ) {
      return false;
    }
    const isDone = view.decidedRequirements >= view.totalRequirements;
    if (statusFilter === 'needs-decision' && isDone) return false;
    if (statusFilter === 'done' && !isDone) return false;
    return true;
  });

  if (searchParams.get('scope') === 'project') {
    return <Navigate to="../review" replace />;
  }

  function selectEntry(entryId: string) {
    const next = new URLSearchParams(searchParams);
    next.delete('scope');
    next.set('member', entryId);
    setSearchParams(next, { replace: true });
    setSelectedRequirementId('');
    setCandidatePreview(null);
  }

  function handlePanelClick(panelId: string) {
    const owner = members.find((member) =>
      panelId.startsWith(`${member.id}-panel-`),
    );
    if (owner && owner.id !== selectedEntryId) {
      selectEntry(owner.id);
    }
    setSelectedRequirementId(panelId);
    setCandidatePreview(null);
  }

  function handleExclusiveChange(checked: boolean) {
    if (!selectedEntryId || isProjectLumber) return;
    workspace.requestExclusiveChange(selectedEntryId, checked);
  }

  function decide(action: () => void) {
    setCandidatePreview(null);
    action();
  }

  const reviewedTotal = selectedEntryView?.totalRequirements ?? 0;
  const reviewedDecided = selectedEntryView?.decidedRequirements ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planner"
        description="Work through one structural member at a time. Every decision feeds the same project-wide allocation."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{workspace.statusLabel}</Badge>
        {plan.status === 'needs_review' && (
          <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
            Needs review
          </Badge>
        )}
      </div>

      <div
        data-testid="planner-workspace"
        className={`grid gap-5 lg:items-start ${
          isProjectLumber
            ? 'lg:grid-cols-[15rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[15rem_minmax(0,1fr)_22rem]'
        }`}
      >
        <aside
          data-testid="planner-member-rail"
          aria-label="Structural members"
          className="space-y-3 rounded-lg border bg-background p-3 lg:sticky lg:top-20"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Members</h2>
            <span className="text-xs text-muted-foreground">
              {filteredEntries.length}/{entryViews.length}
            </span>
          </div>
          <div className="grid gap-2">
            <select
              aria-label="Filter by member type"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as MemberTypeFilter)
              }
            >
              {TYPE_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by member status"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as MemberStatusFilter)
              }
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            {filteredEntries.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No entries match these filters.
              </p>
            ) : (
              filteredEntries.map((view) => {
                const isProjectEntry = view.memberId === PROJECT_LUMBER_ID;
                const member = memberById.get(view.memberId);
                const isSelected = view.memberId === selectedEntryId;
                const isDone = view.decidedRequirements >= view.totalRequirements;
                return (
                  <div
                    key={view.memberId}
                    className={isProjectEntry ? 'border-t pt-1' : undefined}
                  >
                    <button
                      type="button"
                      data-testid={`planner-member-${view.memberId}`}
                      aria-current={isSelected ? 'true' : undefined}
                      aria-label={`${view.memberLabel} · ${view.decidedRequirements}/${view.totalRequirements}`}
                      onClick={() => selectEntry(view.memberId)}
                      className={[
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'hover:bg-accent',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{view.memberLabel}</span>
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {isProjectEntry
                            ? 'No member'
                            : member
                              ? MEMBER_TYPE_LABELS[member.type]
                              : ''}
                        </span>
                      </span>
                      <span
                        className={[
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                          isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        {view.decidedRequirements}/{view.totalRequirements}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
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
            <ErrorState
              message={loadError}
              onRetry={() => void workspace.reload()}
            />
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
                    <p className="font-medium">
                      {selectedEntryView?.memberLabel ?? 'Member'}
                    </p>
                    <p data-testid="planner-progress-summary">
                      <span className="font-medium">{reviewedDecided}</span> of{' '}
                      {reviewedTotal} requirements decided
                    </p>
                    {memberCoverage && (
                      <div className="space-y-0.5 text-muted-foreground">
                        <p data-testid="planner-member-coverage">
                          Panel coverage: {memberCoverage.reused} reused ·{' '}
                          {memberCoverage.newStock} new stock ·{' '}
                          {memberCoverage.unplaced} unplaced
                        </p>
                        <p data-testid="planner-member-boards">
                          Served by{' '}
                          {selectedEntryView?.projection?.distinctBoardCount ?? 0}{' '}
                          board
                          {selectedEntryView?.projection?.distinctBoardCount === 1
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

                  {bulkAcceptPreview && bulkAcceptPreview.totalUndecided > 0 && (
                    <div
                      data-testid="planner-bulk-accept"
                      className="space-y-2 border-t pt-3"
                    >
                      {confirmingBulkAccept ? (
                        <div
                          data-testid="planner-bulk-accept-confirmation"
                          role="status"
                          className="space-y-2 rounded-md border border-amber-600/30 bg-amber-50 p-3 text-amber-900"
                        >
                          <p>
                            Accept {bulkAcceptPreview.acceptedCount} of{' '}
                            {bulkAcceptPreview.totalUndecided};{' '}
                            {bulkAcceptPreview.needsCuttingCount}{' '}
                            {bulkAcceptPreview.needsCuttingCount === 1
                              ? 'needs'
                              : 'need'}{' '}
                            cutting and stay undecided.
                          </p>
                          {bulkAcceptPreview.unavailableCount > 0 && (
                            <p className="text-xs">
                              {bulkAcceptPreview.unavailableCount} candidate
                              {bulkAcceptPreview.unavailableCount === 1
                                ? ' is'
                                : 's are'}{' '}
                              no longer available after earlier acceptances.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={bulkAcceptPreview.acceptedCount === 0}
                              onClick={() => {
                                workspace.bulkAccept(selectedEntryId);
                                setConfirmingBulkAccept(false);
                                setCandidatePreview(null);
                              }}
                            >
                              Accept {bulkAcceptPreview.acceptedCount}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmingBulkAccept(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setConfirmingBulkAccept(true);
                              setCandidatePreview(null);
                            }}
                          >
                            Bulk accept top candidate for{' '}
                            {bulkAcceptPreview.totalUndecided} undecided
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Candidates that require cutting stay undecided.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <RequirementRows
                reviews={reviews}
                lockedRequirementIds={workspace.lockedRequirementIds}
                selectedRequirementId={selectedRequirementId}
                onSelectRequirement={setSelectedRequirementId}
                onAccept={(group, candidate) =>
                  decide(() => workspace.accept(group, candidate))
                }
                onDecline={(group, candidate) =>
                  decide(() => workspace.decline(group, candidate))
                }
                onRestoreDeclined={(group, candidate) =>
                  decide(() => workspace.restoreDeclined(group, candidate))
                }
                onResetRequirement={(group) =>
                  decide(() => workspace.resetRequirement(group))
                }
                onRelease={(group) =>
                  decide(() => workspace.release(group))
                }
                onPreviewCandidate={(group, candidate) =>
                  setCandidatePreview({
                    requirement: group.requirement,
                    candidate,
                  })
                }
                onClearCandidatePreview={() => setCandidatePreview(null)}
              />
            </>
          )}
        </section>

        {!isProjectLumber && (
          <aside
            data-testid="planner-board-pane"
            className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
          >
            {!loading && !loadError && reviews.length > 0 && (
              <MemberBoardViewer
                boards={visibleBoards}
                projectName={project.name}
                memberColors={workspace.memberColors}
                highlightPanelIds={selectedEntryView?.projection?.panelIds}
                focusedPanelId={focusedPanelId}
                candidatePreview={candidatePreview}
                onPanelClick={handlePanelClick}
                onError={workspace.reportError}
              />
            )}
  
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
                  Only reuse unshared inventory pieces. New-stock sheets may still
                  mix members. Exclusivity can reduce utilization by giving up
                  shared boards.
                </p>
                {isExclusive && exclusiveBlockedTotal > 0 && (
                  <p
                    role="status"
                    data-testid="planner-exclusive-reason"
                    className="text-amber-700"
                  >
                    {exclusiveBlockedTotal} shared board candidate
                    {exclusiveBlockedTotal === 1 ? ' is' : 's are'} excluded by
                    exclusivity. Panels without an unshared piece fall back to new
                    stock.
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
                      {selectedEntryView?.memberLabel ?? 'This member'} shares{' '}
                      {sharedPieceRequirementIds.draftRequirementIds.length} draft
                      board
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
                        onClick={() => workspace.confirmExclusive(selectedEntryId)}
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
          </aside>
        )}
      </div>
    </div>
  );
}
