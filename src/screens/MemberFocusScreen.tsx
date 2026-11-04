import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, Crosshair, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { SheetDiagram, SheetNotes } from '@/components/optimize/CutPlanSheet';
import { getActivePieces } from '@/db/inventory';
import { listStructuralMembers } from '@/db/members';
import type { Piece, Project, StructuralMember } from '@/db/types';
import { decomposeMember } from '@/engine/decompose';
import { optimizeProject } from '@/engine';
import type {
  InventoryMatch,
  MatchPiece,
  MatchRequirement,
  PanelRequirement,
} from '@/engine/types';
import { formatMeters, shortId } from '@/lib/format';
import { MEMBER_TYPE_LABELS } from '@/lib/memberLabels';
import {
  allocationsForAssignments,
  assignPanelsToPieces,
  canFitRequirementAlongside,
} from '@/lib/panelAssignments';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

interface MemberEntry {
  member: StructuralMember;
  panels: ReturnType<typeof decomposeMember>;
  reusablePanels: number;
}

function matchRequirementForPanel(panel: PanelRequirement): MatchRequirement {
  return {
    id: panel.id,
    materialType: 'phenolic',
    label: panel.label,
    memberId: panel.memberId,
    length: panel.length,
    width: panel.width,
  };
}

function memberDimensions(member: StructuralMember): string {
  const parts = [member.length, member.width];
  if (member.type !== 'slab') parts.push(member.height);
  return parts.map((value) => formatMeters(value)).join(' × ');
}

function pieceLabel(piece: { id: string; label?: string }): string {
  const id = shortId(piece.id);
  return piece.label ? `${piece.label} · ${id}` : id;
}

function ReuseDiagram({
  piece,
  panel,
  color,
}: {
  piece: MatchPiece;
  panel: PanelRequirement;
  color: string;
}) {
  const fitsUpright =
    panel.length <= piece.length + 1e-9 && panel.width <= piece.width + 1e-9;
  const fitsRotated =
    panel.length <= piece.width + 1e-9 && panel.width <= piece.length + 1e-9;
  if (!fitsUpright && !fitsRotated) return null;

  const placedLength = fitsUpright ? panel.length : panel.width;
  const placedWidth = fitsUpright ? panel.width : panel.length;
  const scale = 120 / Math.max(piece.length, piece.width);
  const width = piece.length * scale;
  const height = piece.width * scale;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      data-testid="focus-reuse-diagram"
      aria-label={`${pieceLabel(piece)} reused for ${formatMeters(panel.length)} by ${formatMeters(panel.width)} panel`}
      className="h-20 w-auto rounded border bg-muted/40"
    >
      <title>{`${formatMeters(piece.length)} × ${formatMeters(piece.width)} piece with the panel placed in one corner`}</title>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        stroke="currentColor"
        strokeDasharray="3 2"
        className="text-muted-foreground"
      />
      <rect
        x={0}
        y={0}
        width={placedLength * scale}
        height={placedWidth * scale}
        fill={color}
        fillOpacity={0.65}
        stroke="currentColor"
        strokeWidth={1}
        className="text-foreground"
      />
    </svg>
  );
}

export default function MemberFocusScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void Promise.all([listStructuralMembers(project.id), getActivePieces(project.id)])
      .then(([nextMembers, nextPieces]) => {
        if (!active) return;
        setMembers(nextMembers);
        setPieces(nextPieces);
        setSelectedId(nextMembers[0]?.id ?? null);
      })
      .catch(() => {
        if (active) {
          setLoadError('Could not load members or inventory. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [project.id, reloadToken, refreshSignal]);

  const matchPieces = useMemo(() => pieces.map(toMatchPiece), [pieces]);

  const memberEntries = useMemo<MemberEntry[]>(
    () =>
      members.map((member) => {
        const panels = decomposeMember(member);
        return {
          member,
          panels,
          reusablePanels: assignPanelsToPieces(panels, matchPieces)
            .coveredPanelCount,
        };
      }),
    [members, matchPieces],
  );

  const selected =
    memberEntries.find((entry) => entry.member.id === selectedId) ?? memberEntries[0];

  useEffect(() => {
    setAssignments({});
  }, [selected?.member.id]);

  const plan = useMemo(() => {
    if (!selected) return null;
    return optimizeProject({
      panels: selected.panels,
      lumberRequirements: [],
      stock: project.stock,
      costs: project.costs,
      pieces: matchPieces,
      satisfiedRequirementIds: new Set(Object.keys(assignments)),
    });
  }, [selected, project.stock, project.costs, matchPieces, assignments]);

  const pieceAllocations = useMemo(
    () =>
      allocationsForAssignments(
        new Map(Object.entries(assignments)),
        (selected?.panels ?? []).map(matchRequirementForPanel),
        matchPieces,
      ),
    [assignments, selected, matchPieces],
  );

  const pageHeader = (
    <PageHeader
      title="Member planner"
      description="Choose one structural member, review its panels, then cut from inventory."
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {pageHeader}
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members and inventory…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {pageHeader}
        <ErrorState
          title="Could not load the member planner"
          message={loadError}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      </div>
    );
  }

  if (memberEntries.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {pageHeader}
        <EmptyState
          icon={Crosshair}
          title="No structural members yet"
          description="Add a column, beam, or slab first, then plan it here one member at a time."
          action={
            <Button asChild>
              <Link to="../members">Add structural members</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!selected || !plan) return null;

  const assignedCount = selected.panels.filter((panel) => assignments[panel.id]).length;
  const panelGroups = new Map(plan.matches.map((group) => [group.requirement.id, group]));
  const memberColors = buildMemberColorMap(
    memberEntries.map((entry) => entry.member.label),
  );
  function useBestMatches() {
    setAssignments(assignPanelsToPieces(selected!.panels, matchPieces).assignments);
  }

  function assignPiece(panelId: string, pieceId: string) {
    setAssignments((current) => {
      const next = { ...current };
      if (!pieceId) {
        delete next[panelId];
        return next;
      }
      next[panelId] = pieceId;
      return next;
    });
  }

  function candidateFits(
    candidate: InventoryMatch,
    panel: PanelRequirement,
  ): boolean {
    const existing = selected!.panels
      .filter(
        (other) =>
          other.id !== panel.id &&
          assignments[other.id] === candidate.pieceId,
      )
      .map(matchRequirementForPanel);
    return canFitRequirementAlongside(
      matchRequirementForPanel(panel),
      existing,
      candidate.piece,
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Member planner"
        description="Choose one structural member, review its panels, then cut from inventory."
        actions={
          <Button type="button" onClick={useBestMatches}>
            <Sparkles className="h-4 w-4" /> Use best matches
          </Button>
        }
      />

      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Preview only. Choosing pieces here does not consume inventory or change your saved
        optimization decisions.
      </p>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Choose a member</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {memberEntries.map((entry) => {
            const active = entry.member.id === selected.member.id;
            return (
              <button
                key={entry.member.id}
                type="button"
                aria-pressed={active}
                data-testid={`member-option-${entry.member.id}`}
                onClick={() => setSelectedId(entry.member.id)}
                className={[
                  'rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'bg-card hover:bg-accent',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.member.label}</span>
                  <Badge variant={active ? 'default' : 'outline'}>
                    {MEMBER_TYPE_LABELS[entry.member.type]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {memberDimensions(entry.member)}
                </p>
                <p
                  data-testid={`member-reuse-${entry.member.id}`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {entry.panels.length} panel{entry.panels.length === 1 ? '' : 's'} ·{' '}
                  {entry.reusablePanels}/{entry.panels.length} panels reusable
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {selected.member.label} · {MEMBER_TYPE_LABELS[selected.member.type]}
            </CardTitle>
            <Badge variant="outline">{memberDimensions(selected.member)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <h3 className="text-sm font-semibold">Panels</h3>
          <ul className="space-y-2">
            {selected.panels.map((panel, index) => {
              const group = panelGroups.get(panel.id);
              const assignedPieceId = assignments[panel.id];
              const assignedPiece = pieces.find((piece) => piece.id === assignedPieceId);
              const assignedMatch = group?.candidates.find(
                (candidate) => candidate.pieceId === assignedPieceId,
              );
              const allocation = pieceAllocations.find(
                (item) => item.pieceId === assignedPieceId,
              );
              const placedPanels = allocation?.plan.panels ?? [];
              const placedIndex = placedPanels.findIndex(
                (placed) => placed.panelId === panel.id,
              );
              const stockArea = allocation
                ? allocation.plan.stock.length * allocation.plan.stock.width
                : 0;
              const remainingAfterPanel =
                allocation && placedIndex >= 0
                  ? stockArea -
                    placedPanels
                      .slice(0, placedIndex + 1)
                      .reduce(
                        (area, placed) => area + placed.length * placed.width,
                        0,
                      )
                  : allocation?.plan.offcutArea;
              const canChoose =
                group?.candidates.some((candidate) => candidateFits(candidate, panel)) ??
                false;
              const allAssignedElsewhere =
                !assignedPiece && (group?.candidates.length ?? 0) > 0 && !canChoose;
              const color = memberColors.get(selected.member.label) ?? '#93c5fd';

              return (
                <li
                  key={panel.id}
                  data-testid={`focus-panel-${panel.id}`}
                  className="rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        Panel {index + 1} of {selected.panels.length}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatMeters(panel.length)} × {formatMeters(panel.width)}
                      </p>
                    </div>
                    <Badge
                      variant={assignedPiece ? 'default' : 'outline'}
                      className={assignedPiece || canChoose ? '' : 'text-muted-foreground'}
                    >
                      {assignedPiece ? 'Reused' : canChoose ? 'Choose a piece' : 'New stock'}
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`focus-piece-${panel.id}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Inventory piece
                    </label>
                    <select
                      id={`focus-piece-${panel.id}`}
                      value={assignedPieceId ?? ''}
                      onChange={(event) => assignPiece(panel.id, event.target.value)}
                      className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">Cut from new stock</option>
                      {group?.candidates.map((candidate) => (
                        <option
                          key={candidate.pieceId}
                          value={candidate.pieceId}
                          disabled={!candidateFits(candidate, panel)}
                        >
                          {pieceLabel(candidate.piece)} · {formatMeters(candidate.piece.length)} ×{' '}
                          {formatMeters(candidate.piece.width)}
                        </option>
                      ))}
                    </select>
                    {group && group.candidates.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No inventory piece fits this panel.
                      </span>
                    )}
                    {allAssignedElsewhere && (
                      <span className="text-xs text-muted-foreground">
                        All matching pieces are already assigned to other panels.
                      </span>
                    )}
                  </div>

                  {assignedPiece && assignedMatch && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-2">
                      <ReuseDiagram piece={assignedMatch.piece} panel={panel} color={color} />
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <p>
                          Source piece {formatMeters(assignedMatch.piece.length)} ×{' '}
                          {formatMeters(assignedMatch.piece.width)}
                        </p>
                        <p>
                          {assignedMatch.requiresCutting
                            ? `Trim to size · ${assignedMatch.surplusArea.toFixed(2)} m² surplus`
                            : 'Exact fit · no trim needed'}
                        </p>
                        {allocation && remainingAfterPanel !== undefined && (
                          <p data-testid={`focus-remaining-${panel.id}`}>
                            Remaining space after this panel{' '}
                            {remainingAfterPanel.toFixed(2)} m² ·{' '}
                            {allocation.panelIds.length} panel
                            {allocation.panelIds.length === 1 ? '' : 's'} on this piece
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {pieceAllocations.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <h3 className="text-sm font-semibold">Reused pieces</h3>
              {pieceAllocations.map((allocation, index) => (
                <div
                  key={allocation.pieceId}
                  data-testid={`focus-piece-plan-${allocation.pieceId}`}
                  className="space-y-2 rounded-md border p-3"
                >
                  <p className="text-sm text-muted-foreground">
                    {formatMeters(allocation.plan.stock.length)} ×{' '}
                    {formatMeters(allocation.plan.stock.width)} ·{' '}
                    {allocation.panelIds.length} panel
                    {allocation.panelIds.length === 1 ? '' : 's'} · remaining{' '}
                    {allocation.plan.offcutArea.toFixed(2)} m²
                  </p>
                  <SheetDiagram
                    sheet={allocation.plan}
                    memberColors={memberColors}
                    svgId={`focus-piece-${index}`}
                  />
                  <SheetNotes sheet={allocation.plan} />
                  <p className="text-xs text-muted-foreground">
                    Dimensions are exact; no saw kerf or blade allowance is included.
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Plan for {selected.member.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            data-testid="focus-summary"
            className="grid grid-cols-2 gap-2 border-b pb-3 text-sm sm:grid-cols-4"
          >
            <div>
              <p className="text-muted-foreground">Reused panels</p>
              <p className="font-semibold">
                {assignedCount} of {selected.panels.length}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">New sheets</p>
              <p className="font-semibold">{plan.plywood.sheets.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Utilization</p>
              <p className="font-semibold">
                {plan.plywood.sheets.length === 0
                  ? '—'
                  : `${plan.plywood.utilization.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Unplaced</p>
              <p className="font-semibold">{plan.plywood.unplacedPanels.length}</p>
            </div>
          </div>

          {plan.remainingPanels.length === 0 && (
            <p className="text-sm font-medium text-emerald-700">
              All panels are reused. No cuts needed.
            </p>
          )}

          {plan.plywood.sheets.map((sheet) => (
            <div key={sheet.sheetIndex} className="space-y-2">
              <p className="text-sm font-semibold">Sheet {sheet.sheetIndex + 1}</p>
              <SheetDiagram
                sheet={sheet}
                memberColors={memberColors}
                svgId={`focus-sheet-${sheet.sheetIndex}`}
              />
              <SheetNotes sheet={sheet} />
            </div>
          ))}

          {plan.plywood.unplacedPanels.length > 0 && (
            <div
              data-testid="focus-unplaced"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-medium">
                {plan.plywood.unplacedPanels.length} panel
                {plan.plywood.unplacedPanels.length === 1 ? '' : 's'} cannot fit the stock sheet
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.plywood.unplacedPanels.map((panel) => (
                  <li key={panel.panelId}>
                    {panel.label} · {formatMeters(panel.length)} × {formatMeters(panel.width)}
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="../settings">
                  Review stock sizes <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
