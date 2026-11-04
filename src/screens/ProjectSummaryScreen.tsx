import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { BarChart3, Boxes, Coins, Download, Layers, Loader2, Recycle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import { filterCuttingPlanSnapshot, getLatestCuttingPlan } from '@/db/plans';
import {
  getOptimizationWorkflow,
  invalidateWorkflow,
  saveOptimizationWorkflow,
} from '@/db/workflow';
import type { Project } from '@/db/types';
import { toMatchRequirements } from '@/engine';
import { decomposeMember } from '@/engine/decompose';
import { buildProjectSummary, type ProjectSummary } from '@/engine/report';
import type { LumberRequirementInput } from '@/engine/types';
import { piecesToCsv } from '@/lib/csv';
import { buildDatedFilename, downloadTextFile } from '@/lib/download';
import { formatMeters, formatPeso } from '@/lib/format';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

const SUMMARY_DESCRIPTION =
  'Material reuse, cutting efficiency, and procurement estimates for this project.';

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}

function Metric({ label, value, hint, testId }: MetricProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p data-testid={testId} className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface BreakdownRowProps {
  label: string;
  detail: string;
  value: string;
  emphasis?: boolean;
}

function BreakdownRow({ label, detail, value, emphasis }: BreakdownRowProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <p className={emphasis ? 'font-semibold' : 'font-medium'}>{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <p className={emphasis ? 'text-lg font-semibold' : 'font-medium'}>{value}</p>
    </div>
  );
}

interface ProjectContextProps {
  project: Project;
  pieceCount: number;
  activePieceCount: number;
}

function ProjectContext({ project, pieceCount, activePieceCount }: ProjectContextProps) {
  const { phenolic, lumberLengths } = project.stock;

  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Project context">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-primary" /> Inventory
          </CardTitle>
          <CardDescription>Stock logged for this project.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Metric label="Pieces logged" value={String(pieceCount)} testId="summary-context-pieces" />
          <Metric
            label="Active pieces"
            value={String(activePieceCount)}
            testId="summary-context-active-pieces"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" /> Cost assumptions
          </CardTitle>
          <CardDescription>Rates applied when a plan is generated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <BreakdownRow
            label="Phenolic sheet"
            detail={`${formatMeters(phenolic.length)} × ${formatMeters(phenolic.width)} × ${phenolic.thickness} m`}
            value={formatPeso(project.costs.phenolicPerSheet)}
          />
          <BreakdownRow
            label="Lumber piece"
            detail={`Stock lengths ${lumberLengths.map((length) => formatMeters(length)).join(' · ')}`}
            value={formatPeso(project.costs.lumberPerPiece)}
          />
        </CardContent>
      </Card>
    </section>
  );
}

export default function ProjectSummaryScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [requirementsCount, setRequirementsCount] = useState(0);
  const [optimizationStarted, setOptimizationStarted] = useState(false);
  const [pieceCount, setPieceCount] = useState(0);
  const [activePieceCount, setActivePieceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [members, lumberRequirements, pieces, savedPlan, workflow] = await Promise.all([
        listStructuralMembers(project.id),
        listLumberRequirements(project.id),
        listPieces(project.id),
        getLatestCuttingPlan(project.id),
        getOptimizationWorkflow(project.id),
      ]);

      const panels = members.flatMap((member) => decomposeMember(member));
      const lumberInputs: LumberRequirementInput[] = lumberRequirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        length: requirement.length,
        crossSection: requirement.crossSection,
      }));
      const requirementIds = new Set([
        ...panels.map((panel) => panel.id),
        ...lumberInputs.map((requirement) => requirement.id),
      ]);
      const snapshot = savedPlan
        ? filterCuttingPlanSnapshot(savedPlan.snapshot, requirementIds)
        : { satisfiedRequirementIds: [], acceptedByRequirement: {} };
      const matchPieces = pieces.map(toMatchPiece);
      const resolvedWorkflow = workflow
        ? invalidateWorkflow(
            workflow,
            toMatchRequirements(panels, lumberInputs),
            matchPieces,
          )
        : null;
      if (resolvedWorkflow && resolvedWorkflow !== workflow) {
        void saveOptimizationWorkflow(project.id, resolvedWorkflow);
      }
      const decisions = resolvedWorkflow
        ? filterCuttingPlanSnapshot(
            {
              satisfiedRequirementIds: resolvedWorkflow.satisfiedRequirementIds,
              acceptedByRequirement: resolvedWorkflow.acceptedByRequirement,
            },
            requirementIds,
          )
        : snapshot;
      const workflowStarted =
        resolvedWorkflow !== null &&
        (resolvedWorkflow.cutPlansReviewedAt !== null ||
          resolvedWorkflow.satisfiedRequirementIds.length > 0 ||
          Object.keys(resolvedWorkflow.acceptedByRequirement).length > 0 ||
          resolvedWorkflow.declinedCandidates.length > 0 ||
          resolvedWorkflow.newStockRequirementIds.length > 0);

      setRequirementsCount(panels.length + lumberInputs.length);
      setOptimizationStarted(snapshot.satisfiedRequirementIds.length > 0 || workflowStarted);
      setPieceCount(pieces.length);
      setActivePieceCount(
        pieces.filter((piece) => !piece.retired && piece.condition !== 'Retired').length,
      );

      setSummary(
        buildProjectSummary({
          panels,
          lumberRequirements: lumberInputs,
          stock: project.stock,
          costs: project.costs,
          pieces: matchPieces,
          satisfiedRequirementIds: new Set(decisions.satisfiedRequirementIds),
        }),
      );
    } catch {
      setError('Could not build the project summary.');
    } finally {
      setLoading(false);
    }
  }, [project.id, project.stock, project.costs]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  async function handleExportCsv() {
    setExportError('');
    try {
      const pieces = await listPieces(project.id);
      downloadTextFile(
        buildDatedFilename(project.name, 'inventory', 'csv'),
        piecesToCsv(pieces),
        'text/csv;charset=utf-8',
      );
    } catch {
      setExportError('Could not export inventory records.');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Summary" description={SUMMARY_DESCRIPTION} />
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading summary…
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Summary" description={SUMMARY_DESCRIPTION} />
        <ErrorState
          message={error || 'Could not build the project summary.'}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  if (requirementsCount === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Summary" description={SUMMARY_DESCRIPTION} />
        <EmptyState
          icon={Boxes}
          title="No requirements yet"
          description="Add structural members or lumber requirements to build a project summary."
          action={
            <Button asChild>
              <Link to="../members">Add structural members</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!optimizationStarted) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Summary" description={SUMMARY_DESCRIPTION} />
        <EmptyState
          icon={BarChart3}
          title="Optimization not started"
          description="Review reusable inventory and plan cuts to generate utilization, cost, and procurement estimates."
          action={
            <Button asChild>
              <Link to="../optimize?step=reuse">Start optimization</Link>
            </Button>
          }
        />
        <ProjectContext
          project={project}
          pieceCount={pieceCount}
          activePieceCount={activePieceCount}
        />
      </div>
    );
  }

  const { procurement } = summary;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Summary"
        description={SUMMARY_DESCRIPTION}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="../optimize">Revisit optimization</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleExportCsv()}>
              <Download className="h-4 w-4" /> Export inventory CSV
            </Button>
          </>
        }
      />

      {exportError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {exportError}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Cutting performance">
        <Metric
          label="Overall utilization"
          value={percent(summary.utilization)}
          hint="Cost-weighted share of new plywood and lumber stock used."
          testId="summary-utilization"
        />
        <Metric
          label="Cutting waste"
          value={percent(summary.waste)}
          hint="Cost-weighted share of new stock that cannot be reused."
          testId="summary-waste"
        />
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Recycle className="h-4 w-4 text-primary" /> Reuse and new materials
          </CardTitle>
          <CardDescription>
            Reuse counts come from the accepted optimization plan for this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Metric label="Reused pieces" value={String(summary.reusedPieces)} testId="summary-reused-pieces" />
          <Metric label="Reuse events" value={String(summary.reuseEvents)} testId="summary-reuse-events" />
          <Metric
            label="New sheets required"
            value={String(summary.newSheetsRequired)}
            hint={`${percent(summary.plywoodUtilization)} of new plywood stock utilized.`}
            testId="summary-new-sheets"
          />
          <Metric
            label="New lumber pieces required"
            value={String(summary.newLumberPiecesRequired)}
            hint={`${percent(summary.lumberUtilization)} of new lumber stock utilized.`}
            testId="summary-new-lumber-pieces"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" /> Procurement breakdown
          </CardTitle>
          <CardDescription>
            Based on {formatPeso(procurement.phenolicSheetCost)} per phenolic sheet and{' '}
            {formatPeso(procurement.lumberPieceCost)} per lumber piece.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <BreakdownRow
            label="Phenolic sheets used"
            detail={`${procurement.phenolicSheetsUsed} × ${formatPeso(procurement.phenolicSheetCost)} per sheet`}
            value={formatPeso(procurement.newPhenolicCost)}
          />
          <BreakdownRow
            label="Phenolic sheets avoided"
            detail={`${procurement.phenolicSheetsAvoided} × ${formatPeso(procurement.phenolicSheetCost)} per sheet`}
            value={formatPeso(procurement.phenolicSavings)}
          />
          <BreakdownRow
            label="New lumber pieces"
            detail={`${procurement.lumberPiecesUsed} × ${formatPeso(procurement.lumberPieceCost)} per piece`}
            value={formatPeso(procurement.lumberCost)}
          />
          <div className="border-t pt-3">
            <BreakdownRow
              label="Total material cost"
              detail="New phenolic sheets plus new lumber pieces."
              value={formatPeso(procurement.totalMaterialCost)}
            />
          </div>
          <div className="border-t pt-3">
            <BreakdownRow
              label="Estimated savings"
              detail="Sheets avoided compared with unsorted, unoptimized cutting."
              value={formatPeso(procurement.totalEstimatedSavings)}
              emphasis
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> How this is calculated
          </CardTitle>
          <CardDescription>
            Utilization and waste are weighted by the cost of the plywood and lumber stock
            each material requires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Plywood utilization {percent(summary.plywoodUtilization)} · waste{' '}
            {percent(summary.plywoodWaste)} · lumber utilization{' '}
            {percent(summary.lumberUtilization)} · waste {percent(summary.lumberWaste)}.
          </p>
          <p>Savings count only phenolic sheets avoided; lumber is reported as a purchase cost.</p>
        </CardContent>
      </Card>
    </div>
  );
}
