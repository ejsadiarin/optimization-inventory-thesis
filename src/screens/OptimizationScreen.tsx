import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import CuttingPlans from '@/components/optimize/CuttingPlans';
import MatchGroups from '@/components/optimize/MatchGroups';
import { declinedKey } from '@/components/optimize/matchLabels';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { offcutKey, type ReusableOffcutEntry } from '@/components/optimize/offcuts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { addPiece, getActivePieces, recordUsage } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import {
  filterCuttingPlanSnapshot,
  getLatestCuttingPlan,
} from '@/db/plans';
import {
  clearWorkflowDecisions,
  emptyWorkflow,
  getOptimizationWorkflow,
  invalidateWorkflow,
  saveOptimizationWorkflow,
  workflowFromSnapshot,
  type OptimizationStep,
  type OptimizationWorkflow,
} from '@/db/workflow';
import type { Piece, Project } from '@/db/types';
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
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

const OFFCUT_THICKNESS = 0.012;

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
  const [intakeMessage, setIntakeMessage] = useState('');
  const [intakeError, setIntakeError] = useState('');
  const [addingOffcuts, setAddingOffcuts] = useState(false);

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
  const newStockRequirementIds = useMemo(
    () => new Set(workflow.newStockRequirementIds),
    [workflow.newStockRequirementIds],
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
  const visibleGroups = groups.filter(
    (group) => !newStockRequirementIds.has(group.requirement.id),
  );

  const memberColors = useMemo(
    () =>
      buildMemberColorMap(
        optimization.plywood.sheets.flatMap((sheet) =>
          sheet.panels.map((panel) => panel.label),
        ),
      ),
    [optimization.plywood.sheets],
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

  function handlePlanFromNewStock(group: MatchGroup) {
    const requirementId = group.requirement.id;
    updateWorkflow((current) =>
      current.satisfiedRequirementIds.includes(requirementId) ||
      current.newStockRequirementIds.includes(requirementId)
        ? current
        : {
            ...current,
            newStockRequirementIds: [...current.newStockRequirementIds, requirementId],
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
          thickness: OFFCUT_THICKNESS,
          condition: 'Good',
          dateAdded,
          source: 'Cut plan offcut',
        });
      }
      setAddedOffcutKeys((current) => new Set([...current, ...pending.map((entry) => entry.key)]));
      setSelectedOffcutKeys(new Set());
      setIntakeMessage(
        `Added ${pending.length} offcut${pending.length === 1 ? '' : 's'} to inventory.`,
      );
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

  const hasResettableDecisions =
    workflow.declinedCandidates.length > 0 || workflow.newStockRequirementIds.length > 0;

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
        />
      ) : step === 'reuse' ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
              <div className="space-y-1">
                <p>
                  <span className="font-medium">{satisfiedRequirementIds.size}</span> of{' '}
                  {groups.length} requirements satisfied
                </p>
                {newStockRequirementIds.size > 0 && (
                  <p className="text-muted-foreground">
                    {newStockRequirementIds.size} planned from new stock
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {optimization.remainingPanels.length +
                    optimization.remainingLumberRequirements.length}{' '}
                  remaining for cutting
                </span>
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
            </CardContent>
          </Card>

          {visibleGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="font-medium">All requirements are planned from new stock.</p>
                <p className="text-sm text-muted-foreground">
                  Continue to Plan cuts to arrange the remaining material.
                </p>
              </CardContent>
            </Card>
          ) : (
            <MatchGroups
              groups={visibleGroups}
              satisfiedRequirementIds={satisfiedRequirementIds}
              acceptedByRequirement={acceptedByRequirement}
              declinedCandidates={declinedCandidates}
              onAccept={(group, candidate) => void handleAccept(group, candidate)}
              onDecline={handleDecline}
              onPlanFromNewStock={handlePlanFromNewStock}
            />
          )}
        </>
      ) : (
        <CuttingPlans
          optimization={optimization}
          memberColors={memberColors}
          reusableOffcuts={reusableOffcuts}
          selectedOffcutKeys={selectedOffcutKeys}
          addedOffcutKeys={addedOffcutKeys}
          addingOffcuts={addingOffcuts}
          intakeMessage={intakeMessage}
          intakeError={intakeError}
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
