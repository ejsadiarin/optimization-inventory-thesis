import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, Coins, Download, Layers, Loader2, Recycle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import { filterCuttingPlanSnapshot, getLatestCuttingPlan } from '@/db/plans';
import type { Project } from '@/db/types';
import { decomposeMember } from '@/engine/decompose';
import { buildProjectSummary, type ProjectSummary } from '@/engine/report';
import type { LumberRequirementInput } from '@/engine/types';
import { piecesToCsv } from '@/lib/csv';
import { buildDatedFilename, downloadTextFile } from '@/lib/download';
import { formatPeso } from '@/lib/format';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

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

export default function ProjectSummaryScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [members, lumberRequirements, pieces, savedPlan] = await Promise.all([
        listStructuralMembers(project.id),
        listLumberRequirements(project.id),
        listPieces(project.id),
        getLatestCuttingPlan(project.id),
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
      const satisfiedRequirementIds = savedPlan
        ? filterCuttingPlanSnapshot(savedPlan.snapshot, requirementIds)
            .satisfiedRequirementIds
        : [];

      setSummary(
        buildProjectSummary({
          panels,
          lumberRequirements: lumberInputs,
          stock: project.stock,
          costs: project.costs,
          pieces: pieces.map(toMatchPiece),
          satisfiedRequirementIds: new Set(satisfiedRequirementIds),
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
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading summary…
      </div>
    );
  }

  if (error || !summary) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        {error || 'Could not build the project summary.'}
      </p>
    );
  }

  const { procurement } = summary;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Summary</h1>
          <p className="text-sm text-muted-foreground">
            Material reuse, cutting efficiency, and procurement estimates for this project.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleExportCsv()}>
          <Download className="h-4 w-4" /> Export inventory CSV
        </Button>
      </div>

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
