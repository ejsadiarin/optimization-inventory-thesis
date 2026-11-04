import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2, PackageSearch } from 'lucide-react';
import CuttingPlans from '@/components/optimize/CuttingPlans';
import MatchGroups from '@/components/optimize/MatchGroups';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { offcutKey, type ReusableOffcutEntry } from '@/components/optimize/offcuts';
import {
  countReviews,
  decidedCount,
  reviewRequirements,
  REUSE_STATUS_LABELS,
  REUSE_STATUSES,
  type ReuseStatus,
} from '@/components/optimize/reuseReview';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { addPiece, getActivePieces, recordUsage } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import {
  filterCuttingPlanSnapshot,
  getLatestCuttingPlan,
} from '@/db/plans';
import {
  clearWorkflowDecisions,
  declinedKey,
  emptyWorkflow,
  getOptimizationWorkflow,
  invalidateWorkflow,
  resetRequirementDecisions,
  restoreDeclinedCandidate,
  saveOptimizationWorkflow,
  workflowFromSnapshot,
  type OptimizationStep,
  type OptimizationWorkflow,
} from '@/db/workflow';
import { INSPECTION_USAGE_THRESHOLD, type Piece, type Project } from '@/db/types';
import { optimizeProject, toMatchRequirements } from '@/engine';
import { decomposeMember } from '@/engine/decompose';
import type {
  InventoryMatch,
  LumberRequirementInput,
  MatchGroup,
  MatchPiece,
  PanelRequirement,
} from '@/engine/types';
import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { shortId } from '@/lib/format';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

const STEPS: ReadonlyArray<{ id: OptimizationStep; label: string; description: string }> = [
  { id: 'reuse', label: 'Reuse inventory', description: 'Choose reusable pieces' },
  { id: 'cuts', label: 'Plan cuts', description: 'Arrange remaining stock' },
];

function parseStep(value: string | null): OptimizationStep | null {
  return value === 'reuse' || value === 'cuts' ? value : null;
}

export default function OptimizationScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStepRef = useRef(parseStep(searchParams.get('step')));
  const [panels, setPanels] = useState<PanelRequirement[]>([]);
  const [lumberInputs, setLumberInputs] = useState<LumberRequirementInput[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [workflow, setWorkflow] = useState<OptimizationWorkflow>(() => emptyWorkflow());
  const dirtyWorkflowRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [selectedOffcutKeys, setSelectedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [addedOffcutKeys, setAddedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [intakeError, setIntakeError] = useState('');
  const [addingOffcuts, setAddingOffcuts] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReuseStatus>('needsDecision');

  const satisfiedRequirementIds = useMemo(
    () => new Set(workflow.satisfiedRequirementIds),
    [workflow.satisfiedRequirementIds],
  );
  const acceptedByRequirement = useMemo(
    () => new Map(Object.entries(workflow.acceptedByRequirement)),
    [workflow.acceptedByRequirement],
  );
  const declinedCandidates = useMemo(
    () => new Set(workflow.declinedCandidates),
    [workflow.declinedCandidates],
  );
  const step = parseStep(searchParams.get('step')) ?? workflow.step;

  const updateWorkflow = useCallback(
    (update: (current: OptimizationWorkflow) => OptimizationWorkflow) => {
      setWorkflow((current) => {
        const next = update(current);
        if (next === current) return current;
        dirtyWorkflowRef.current = true;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!dirtyWorkflowRef.current) return;
    dirtyWorkflowRef.current = false;
    void saveOptimizationWorkflow(project.id, workflow);
  }, [workflow, project.id]);

  useEffect(() => {
    urlStepRef.current = parseStep(searchParams.get('step'));
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [members, lumberRequirements, inventoryPieces, savedPlan, storedWorkflow] =
        await Promise.all([
          listStructuralMembers(project.id),
          listLumberRequirements(project.id),
          getActivePieces(project.id),
          getLatestCuttingPlan(project.id),
          getOptimizationWorkflow(project.id),
        ]);

      const panelRequirements = members.flatMap((member) => decomposeMember(member));
      const lumberRequirementInputs: LumberRequirementInput[] = lumberRequirements.map(
        (requirement) => ({
          id: requirement.id,
          label: requirement.label,
          length: requirement.length,
          crossSection: requirement.crossSection,
        }),
      );
      const matchPieces = inventoryPieces.map(toMatchPiece);
      const requirementIds = new Set([
        ...panelRequirements.map((panel) => panel.id),
        ...lumberRequirementInputs.map((requirement) => requirement.id),
      ]);
      const snapshot = savedPlan
        ? filterCuttingPlanSnapshot(savedPlan.snapshot, requirementIds)
        : { satisfiedRequirementIds: [], acceptedByRequirement: {} };
      const matchRequirements = toMatchRequirements(
        panelRequirements,
        lumberRequirementInputs,
      );

      const base = storedWorkflow ?? workflowFromSnapshot(snapshot);
      const resolved = invalidateWorkflow(base, matchRequirements, matchPieces);
      const urlStep = urlStepRef.current;
      const nextStep = urlStep ?? resolved.step;
      const nextWorkflow =
        nextStep === resolved.step ? resolved : { ...resolved, step: nextStep };

      setPanels(panelRequirements);
      setLumberInputs(lumberRequirementInputs);
      setPieces(matchPieces);
      setWorkflow(nextWorkflow);

      if (
        (storedWorkflow && nextWorkflow !== storedWorkflow) ||
        (!storedWorkflow && urlStep)
      ) {
        dirtyWorkflowRef.current = true;
      }
    } catch {
      setLoadError('Could not load optimization data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  useEffect(() => {
    if (loading || loadError) return;
    const urlStep = parseStep(searchParams.get('step'));
    if (!urlStep || urlStep === workflow.step) return;
    updateWorkflow((current) =>
      current.step === urlStep ? current : { ...current, step: urlStep },
    );
  }, [searchParams, workflow.step, loading, loadError, updateWorkflow]);

  useEffect(() => {
    if (loading || loadError || step !== 'cuts') return;
    const reviewedAt = new Date().toISOString();
    updateWorkflow((current) =>
      current.cutPlansReviewedAt === null
        ? { ...current, cutPlansReviewedAt: reviewedAt }
        : current,
    );
  }, [step, loading, loadError, updateWorkflow]);

  const optimization = useMemo(
    () =>
      optimizeProject({
        panels,
        lumberRequirements: lumberInputs,
        stock: project.stock,
        costs: project.costs,
        pieces,
        satisfiedRequirementIds,
      }),
    [panels, lumberInputs, project.stock, project.costs, pieces, satisfiedRequirementIds],
  );

  const groups = optimization.matches;
  const reviews = useMemo(
    () =>
      reviewRequirements(
        groups,
        satisfiedRequirementIds,
        acceptedByRequirement,
        declinedCandidates,
      ),
    [
      groups,
      satisfiedRequirementIds,
      acceptedByRequirement,
      declinedCandidates,
    ],
  );
  const reviewCounts = useMemo(() => countReviews(reviews), [reviews]);
  const decided = decidedCount(reviews);
  const filteredReviews = useMemo(
    () => reviews.filter((review) => review.status === statusFilter),
    [reviews, statusFilter],
  );
  const allSatisfied = reviews.length > 0 && reviews.every((review) => review.status === 'satisfied');
  const allDecided = reviews.length > 0 && decided === reviews.length;
  const remainingForCutting =
    optimization.remainingPanels.length + optimization.remainingLumberRequirements.length;
  const oversizedForStock =
    optimization.plywood.oversizedPanels.length +
    optimization.lumber.unplacedRequirements.length;
  const noReuseOptions = reviews.every(
    (review) => review.status === 'noMatch' || review.status === 'newStock',
  );
  const allRemainingOversized =
    remainingForCutting > 0 &&
    oversizedForStock === remainingForCutting &&
    noReuseOptions;

  const memberColors = useMemo(
    () => buildMemberColorMap(panels.map((panel) => panel.label)),
    [panels],
  );

  const reusableOffcuts = useMemo<ReusableOffcutEntry[]>(
    () =>
      optimization.plywood.sheets.flatMap((sheet) =>
        sheet.offcuts
          .filter((offcut) => offcut.reusable)
          .map((offcut) => ({
            key: offcutKey(sheet.sheetIndex, offcut),
            sheetIndex: sheet.sheetIndex,
            offcut,
          })),
      ),
    [optimization.plywood.sheets],
  );

  function handleStepChange(next: OptimizationStep) {
    if (loading || loadError) return;
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('step', next);
        return params;
      },
      { replace: true },
    );
    updateWorkflow((current) =>
      current.step === next ? current : { ...current, step: next },
    );
  }

  async function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
    setError('');
    if (satisfiedRequirementIds.has(group.requirement.id)) return;

    const assignedElsewhere = Array.from(acceptedByRequirement.entries()).some(
      ([requirementId, pieceId]) =>
        requirementId !== group.requirement.id && pieceId === candidate.pieceId,
    );
    if (assignedElsewhere) {
      setError('This piece is already assigned to another requirement.');
      return;
    }

    const inspectionDue =
      (candidate.piece.usageCount ?? 0) + 1 === INSPECTION_USAGE_THRESHOLD;
    let updated: Piece;
    try {
      updated = await recordUsage(candidate.piece.id, project.id, group.requirement.label);
    } catch {
      setError('Could not record usage for this piece. It may have been retired.');
      return;
    }

    updateWorkflow((current) => ({
      ...current,
      satisfiedRequirementIds: [
        ...current.satisfiedRequirementIds,
        group.requirement.id,
      ],
      acceptedByRequirement: {
        ...current.acceptedByRequirement,
        [group.requirement.id]: candidate.pieceId,
      },
    }));
    setPieces((current) =>
      current.map((piece) =>
        piece.id === candidate.pieceId
          ? {
              ...piece,
              usageCount: updated.usageCount,
              condition: updated.condition,
              retired: updated.retired,
            }
          : piece,
      ),
    );
    toast({
      title: `Accepted ${group.requirement.label}`,
      description: `${shortId(candidate.pieceId)} · usage ${updated.usageCount}${
        inspectionDue ? ' · flagged for inspection after this use' : ''
      }`,
      variant: inspectionDue ? 'warning' : 'success',
    });
  }

  function handleRestoreDeclined(group: MatchGroup, candidate: InventoryMatch) {
    updateWorkflow((current) =>
      restoreDeclinedCandidate(
        current,
        declinedKey(group.requirement.id, candidate.pieceId),
      ),
    );
  }

  function handleResetRequirement(group: MatchGroup) {
    updateWorkflow((current) =>
      resetRequirementDecisions(current, group.requirement.id),
    );
  }

  function handleDecline(group: MatchGroup, candidate: InventoryMatch) {
    const key = declinedKey(group.requirement.id, candidate.pieceId);
    updateWorkflow((current) =>
      current.declinedCandidates.includes(key)
        ? current
        : {
            ...current,
            declinedCandidates: [...current.declinedCandidates, key],
          },
    );
  }

  function handleResetDecisions() {
    updateWorkflow(clearWorkflowDecisions);
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
      setAddedOffcutKeys((current) => new Set([...current, ...pending.map((entry) => entry.key)]));
      setSelectedOffcutKeys(new Set());
      toast({
        title: `Returned ${pending.length} offcut${pending.length === 1 ? '' : 's'} to inventory`,
        description: 'Added as Good with 0 uses. Available in the next optimization session.',
        variant: 'success',
      });
    } catch (caught) {
      setIntakeError(
        caught instanceof Error ? caught.message : 'Could not add offcuts to inventory.',
      );
    } finally {
      setAddingOffcuts(false);
    }
  }

  function exportSheet(sheetIndex: number) {
    const element = document.getElementById(`cut-plan-sheet-${sheetIndex}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      setError('Could not find the cutting plan sheet to export.');
      return;
    }
    downloadSvgAsFile(
      buildDatedFilename(project.name, `cut-plan-sheet-${sheetIndex + 1}`, 'svg'),
      element as unknown as SVGSVGElement,
    );
  }

  function exportSheetPng(sheetIndex: number) {
    const element = document.getElementById(`cut-plan-sheet-${sheetIndex}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      setError('Could not find the cutting plan sheet to export.');
      return;
    }
    void downloadSvgAsPng(
      buildDatedFilename(project.name, `cut-plan-sheet-${sheetIndex + 1}`, 'png'),
      element as unknown as SVGSVGElement,
    ).catch(() => {
      setError('Could not export the cutting plan image.');
    });
  }

  function exportAllSheets() {
    optimization.plywood.sheets.forEach((sheet) => exportSheet(sheet.sheetIndex));
  }

  const hasResettableDecisions = workflow.declinedCandidates.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Optimization"
        description="Review reusable inventory pieces before planning cuts on new stock."
      />

      <nav
        aria-label="Optimization steps"
        className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-1"
      >
        {STEPS.map((item) => {
          const current = step === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={current ? 'step' : undefined}
              disabled={loading || Boolean(loadError)}
              onClick={() => handleStepChange(item.id)}
              className={[
                'rounded-md px-3 py-2 text-left transition-colors',
                current
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent',
                loading || loadError ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs">{item.description}</span>
            </button>
          );
        })}
      </nav>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => void load()} />
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading matches…
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No formwork requirements yet"
          description="Add structural members or lumber requirements to see reuse matches."
          action={
            <Button asChild>
              <Link to="../members">Add structural members</Link>
            </Button>
          }
        />
      ) : step === 'reuse' ? (
        pieces.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No inventory pieces yet"
            description="Add reusable pieces or record offcuts before reviewing matches."
            action={
              <Button asChild>
                <Link to="../inventory">Add inventory</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p data-testid="reuse-progress-summary">
                      <span className="font-medium">{decided}</span> of {reviews.length}{' '}
                      requirements decided
                    </p>
                    <p className="text-muted-foreground">
                      {remainingForCutting} remaining for cutting
                    </p>
                  </div>
                  {hasResettableDecisions && (
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={handleResetDecisions}
                    >
                      Reset decisions
                    </Button>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-label="Reuse review progress"
                  aria-valuemin={0}
                  aria-valuemax={reviews.length}
                  aria-valuenow={decided}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round((decided / reviews.length) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {allSatisfied && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="space-y-1">
                    <p className="font-medium">
                      All requirements covered by reusable inventory
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Every requirement is matched to existing stock, so nothing needs new
                      material.
                    </p>
                  </div>
                  <Button type="button" onClick={() => handleStepChange('cuts')}>
                    Continue to Plan cuts <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {!allSatisfied && allRemainingOversized && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="space-y-1">
                    <p className="font-medium">Remaining panels exceed stock sizes</p>
                    <p className="text-sm text-muted-foreground">
                      Increase the phenolic sheet or lumber stock sizes to plan these cuts.
                    </p>
                  </div>
                  <Button asChild>
                    <Link to="../settings">Review stock sizes</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <div
              role="group"
              aria-label="Filter requirements by status"
              className="flex flex-wrap gap-1.5"
            >
              {REUSE_STATUSES.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={statusFilter === status ? 'default' : 'outline'}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {REUSE_STATUS_LABELS[status]} ({reviewCounts[status]})
                </Button>
              ))}
            </div>

            {filteredReviews.length === 0 ? (
              <Card>
                <CardContent className="space-y-3 py-8 text-center">
                  <p className="font-medium">
                    No requirements in {REUSE_STATUS_LABELS[statusFilter]}.
                  </p>
                  {allDecided && !allSatisfied && !allRemainingOversized && (
                    <Button type="button" onClick={() => handleStepChange('cuts')}>
                      Continue to Plan cuts <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <MatchGroups
                reviews={filteredReviews}
                memberColors={memberColors}
                onAccept={(group, candidate) => void handleAccept(group, candidate)}
                onDecline={handleDecline}
                onRestoreDeclined={handleRestoreDeclined}
                onResetRequirement={handleResetRequirement}
              />
            )}
          </>
        )
      ) : (
        <CuttingPlans
          optimization={optimization}
          memberColors={memberColors}
          reusableOffcuts={reusableOffcuts}
          selectedOffcutKeys={selectedOffcutKeys}
          addedOffcutKeys={addedOffcutKeys}
          addingOffcuts={addingOffcuts}
          intakeError={intakeError}
          cutPlansReviewedAt={workflow.cutPlansReviewedAt}
          onToggleOffcut={toggleOffcut}
          onAddOffcuts={() => void handleAddOffcuts()}
          onExportSheet={exportSheet}
          onExportSheetPng={exportSheetPng}
          onExportAllSheets={exportAllSheets}
        />
      )}
    </div>
  );
}
