import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Check, Download, Loader2, PackageSearch, Plus } from 'lucide-react';
import CutPlanSheet from '@/components/optimize/CutPlanSheet';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { addPiece, getActivePieces, recordUsage } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import type { Piece, Project } from '@/db/types';
import { optimizeProject } from '@/engine';
import { decomposeMember } from '@/engine/decompose';
import { matchInventory, remainingRequirements } from '@/engine/match';
import type {
  InventoryMatch,
  LumberRequirementInput,
  MatchGroup,
  MatchPiece,
  MatchRequirement,
  Offcut,
  PanelRequirement,
} from '@/engine/types';
import {
  conditionBadgeClass,
  formatMeters,
  formatPeso,
  materialTypeLabel,
} from '@/lib/format';
import { buildDatedFilename, downloadSvgAsFile } from '@/lib/download';

const OFFCUT_THICKNESS = 0.012;

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function crossSectionLabel(crossSection: string): string {
  return crossSection.replace('x', '×');
}

function toMatchPiece(piece: Piece): MatchPiece {
  return {
    id: piece.id,
    materialType: piece.materialType,
    length: piece.length,
    width: piece.width,
    crossSection: piece.crossSection,
    condition: piece.condition,
    retired: piece.retired,
    usageCount: piece.usageCount,
  };
}

function requirementDimensions(requirement: MatchRequirement): string {
  if (requirement.materialType === 'lumber') {
    return `${formatMeters(requirement.length)} · ${crossSectionLabel(requirement.crossSection ?? '—')}`;
  }
  return `${formatMeters(requirement.length)} × ${formatMeters(requirement.width ?? 0)}`;
}

function candidateDimensions(piece: MatchPiece): string {
  if (piece.materialType === 'lumber') {
    return `${formatMeters(piece.length)} · ${crossSectionLabel(piece.crossSection ?? '—')}`;
  }
  return `${formatMeters(piece.length)} × ${formatMeters(piece.width)}`;
}

function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}

interface ReusableOffcutEntry {
  key: string;
  sheetIndex: number;
  offcut: Offcut;
}

function offcutKey(sheetIndex: number, offcut: Offcut): string {
  return `${sheetIndex}:${offcut.x.toFixed(3)}:${offcut.y.toFixed(3)}:${offcut.length.toFixed(3)}:${offcut.width.toFixed(3)}`;
}

export default function OptimizationScreen() {
  const project = useOutletContext<Project>();
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [panels, setPanels] = useState<PanelRequirement[]>([]);
  const [lumberInputs, setLumberInputs] = useState<LumberRequirementInput[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [satisfiedRequirementIds, setSatisfiedRequirementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [acceptedByRequirement, setAcceptedByRequirement] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [declinedCandidates, setDeclinedCandidates] = useState<Set<string>>(() => new Set());
  const [selectedOffcutKeys, setSelectedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [addedOffcutKeys, setAddedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [intakeMessage, setIntakeMessage] = useState('');
  const [intakeError, setIntakeError] = useState('');
  const [addingOffcuts, setAddingOffcuts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [members, lumberRequirements, inventoryPieces] = await Promise.all([
      listStructuralMembers(project.id),
      listLumberRequirements(project.id),
      getActivePieces(project.id),
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
    const requirements: MatchRequirement[] = [
      ...panelRequirements.map((panel) => ({
        id: panel.id,
        materialType: 'phenolic' as const,
        label: panel.label,
        length: panel.length,
        width: panel.width,
      })),
      ...lumberRequirementInputs.map((requirement) => ({
        id: requirement.id,
        materialType: 'lumber' as const,
        label: requirement.label,
        length: requirement.length,
        crossSection: requirement.crossSection,
      })),
    ];
    const matchPieces = inventoryPieces.map(toMatchPiece);

    setPanels(panelRequirements);
    setLumberInputs(lumberRequirementInputs);
    setPieces(matchPieces);
    setGroups(matchInventory(requirements, matchPieces));
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const remaining = remainingRequirements(groups, satisfiedRequirementIds);

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

  const memberColors = useMemo(
    () =>
      buildMemberColorMap(
        optimization.plywood.sheets.flatMap((sheet) =>
          sheet.panels.map((panel) => panel.sourceMemberLabel),
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

  const selectedOffcutCount = reusableOffcuts.filter(
    (entry) => !addedOffcutKeys.has(entry.key) && selectedOffcutKeys.has(entry.key),
  ).length;

  async function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
    setError('');
    try {
      const updated = await recordUsage(
        candidate.piece.id,
        project.id,
        group.requirement.label,
      );

      setSatisfiedRequirementIds((current) => new Set(current).add(group.requirement.id));
      setAcceptedByRequirement((current) =>
        new Map(current).set(group.requirement.id, candidate.pieceId),
      );
      setGroups((current) =>
        current.map((item) => {
          if (item.requirement.id !== group.requirement.id) return item;
          return {
            ...item,
            candidates: item.candidates.map((entry) =>
              entry.pieceId === candidate.pieceId
                ? {
                    ...entry,
                    piece: {
                      ...entry.piece,
                      usageCount: updated.usageCount,
                      condition: updated.condition,
                      retired: updated.retired,
                    },
                  }
                : entry,
            ),
          };
        }),
      );
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
    } catch {
      setError('Could not record usage for this piece. It may have been retired.');
    }
  }

  function handleDecline(group: MatchGroup, candidate: InventoryMatch) {
    setDeclinedCandidates((current) =>
      new Set(current).add(declinedKey(group.requirement.id, candidate.pieceId)),
    );
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

  function exportAllSheets() {
    optimization.plywood.sheets.forEach((sheet) => exportSheet(sheet.sheetIndex));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Optimization</h1>
        <p className="text-sm text-muted-foreground">
          Review reusable inventory pieces before planning cuts on new stock.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading matches…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PackageSearch className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No formwork requirements yet</p>
            <p className="text-sm text-muted-foreground">
              Add structural members or lumber requirements to see reuse matches.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
              <span className="font-medium">
                {satisfiedRequirementIds.size} of {groups.length} requirements satisfied
              </span>
              <span className="text-muted-foreground">
                {remaining.length} remaining for cutting
              </span>
            </CardContent>
          </Card>

          {groups.map((group) => {
            const requirement = group.requirement;
            const satisfied = satisfiedRequirementIds.has(requirement.id);
            const acceptedPieceId = acceptedByRequirement.get(requirement.id);
            const visibleCandidates = group.candidates.filter((candidate) => {
              if (declinedCandidates.has(declinedKey(requirement.id, candidate.pieceId))) {
                return false;
              }
              return !acceptedPieceId || candidate.pieceId === acceptedPieceId;
            });

            return (
              <Card key={requirement.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{requirement.label}</CardTitle>
                      <CardDescription>{requirementDimensions(requirement)}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">{materialTypeLabel(requirement.materialType)}</Badge>
                      {satisfied && (
                        <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
                          <Check className="mr-1 h-3 w-3" /> Satisfied
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {visibleCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active inventory pieces match this requirement.
                    </p>
                  ) : (
                    visibleCandidates.map((candidate) => (
                      <div
                        key={candidate.pieceId}
                        className="rounded-md border bg-background p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold">
                              {shortId(candidate.piece.id)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {candidateDimensions(candidate.piece)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge className={conditionBadgeClass(candidate.piece.condition)}>
                              {candidate.piece.condition}
                            </Badge>
                            <Badge variant="secondary">
                              Usage {candidate.piece.usageCount ?? 0}
                            </Badge>
                            {candidate.requiresCutting && (
                              <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
                                <AlertTriangle className="mr-1 h-3 w-3" /> Requires cutting
                              </Badge>
                            )}
                          </div>
                        </div>

                        {!satisfied && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              aria-label={`Accept ${shortId(candidate.piece.id)} for ${requirement.label}`}
                              onClick={() => void handleAccept(group, candidate)}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Decline ${shortId(candidate.piece.id)} for ${requirement.label}`}
                              onClick={() => handleDecline(group, candidate)}
                            >
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {satisfied && (
                    <p className="text-sm font-medium text-emerald-700">Excluded from cutting.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <section className="space-y-4 border-t pt-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cutting plans</h2>
              <p className="text-sm text-muted-foreground">
                Plans for requirements not covered by reused inventory.
              </p>
            </div>

            {remaining.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="font-medium">All requirements satisfied by reused pieces.</p>
                  <p className="text-sm text-muted-foreground">
                    No new stock sheets or lumber pieces need to be cut.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardContent className="grid gap-2 py-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground">Sheets used</p>
                      <p className="font-semibold">{optimization.stats.plywood.sheetsUsed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sheets saved</p>
                      <p className="font-semibold">{optimization.stats.plywood.sheetsSaved}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Estimated savings</p>
                      <p className="font-semibold">
                        {formatPeso(optimization.stats.estimatedSavings)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {optimization.remainingPanels.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Plywood sheets</h3>
                      {optimization.plywood.sheets.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Export all sheets"
                          onClick={exportAllSheets}
                        >
                          <Download className="h-4 w-4" /> Export all
                        </Button>
                      )}
                    </div>

                    {optimization.plywood.sheets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No plywood panels can be placed on the configured stock sheet.
                      </p>
                    ) : (
                      optimization.plywood.sheets.map((sheet) => (
                        <Card key={sheet.sheetIndex}>
                          <CardContent className="py-4">
                            <CutPlanSheet
                              sheet={sheet}
                              memberColors={memberColors}
                              onExport={() => exportSheet(sheet.sheetIndex)}
                            />
                          </CardContent>
                        </Card>
                      ))
                    )}

                    {optimization.plywood.oversizedPanels.length > 0 && (
                      <Card className="border-amber-300 bg-amber-50">
                        <CardContent className="space-y-1 py-4 text-sm text-amber-900">
                          <p className="flex items-center gap-1 font-medium">
                            <AlertTriangle className="h-4 w-4" /> Oversized panels
                          </p>
                          <ul className="list-disc space-y-1 pl-5">
                            {optimization.plywood.oversizedPanels.map((panel) => (
                              <li key={panel.panelId}>
                                {panel.label} ({formatMeters(panel.length)} ×{' '}
                                {formatMeters(panel.width)}) cannot fit on a stock sheet.
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {optimization.remainingLumberRequirements.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Lumber cuts</h3>

                    {optimization.lumber.groups.map((group) => (
                      <Card key={group.crossSection}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {crossSectionLabel(group.crossSection)} lumber
                          </CardTitle>
                          <CardDescription>
                            {group.stockPiecesUsed} stock piece
                            {group.stockPiecesUsed === 1 ? '' : 's'} ·{' '}
                            {group.utilization.toFixed(1)}% utilized
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {group.stocks.map((stock) => (
                            <div key={stock.stockIndex} className="rounded-md border p-2">
                              <p className="text-sm font-medium">
                                Stock {stock.stockIndex + 1} ·{' '}
                                {formatMeters(stock.stockLength)} · offcut{' '}
                                {formatMeters(stock.offcutLength)}
                              </p>
                              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                {stock.cuts.map((cut) => (
                                  <li key={`${stock.stockIndex}-${cut.requirementId}`}>
                                    {cut.label} · {formatMeters(cut.length)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}

                    {optimization.lumber.unplacedRequirements.length > 0 && (
                      <Card className="border-amber-300 bg-amber-50">
                        <CardContent className="space-y-1 py-4 text-sm text-amber-900">
                          <p className="flex items-center gap-1 font-medium">
                            <AlertTriangle className="h-4 w-4" /> Oversized lumber
                          </p>
                          <ul className="list-disc space-y-1 pl-5">
                            {optimization.lumber.unplacedRequirements.map((requirement) => (
                              <li key={requirement.requirementId}>
                                {requirement.label} ({formatMeters(requirement.length)} ·{' '}
                                {crossSectionLabel(requirement.crossSection)}) is longer than
                                the longest stock length.
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {reusableOffcuts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Reusable offcuts</CardTitle>
                      <CardDescription>
                        Select offcuts to keep. They are added to inventory as Good with 0 uses.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-2">
                        {reusableOffcuts.map((entry, index) => {
                          const added = addedOffcutKeys.has(entry.key);
                          return (
                            <li
                              key={entry.key}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  aria-label={`Keep offcut ${index + 1} from sheet ${entry.sheetIndex + 1}`}
                                  checked={selectedOffcutKeys.has(entry.key)}
                                  disabled={added}
                                  onCheckedChange={(checked) =>
                                    toggleOffcut(entry.key, checked === true)
                                  }
                                />
                                <div>
                                  <p className="text-sm font-medium">
                                    {formatMeters(entry.offcut.length)} ×{' '}
                                    {formatMeters(entry.offcut.width)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Sheet {entry.sheetIndex + 1}
                                  </p>
                                </div>
                              </div>
                              {added && (
                                <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
                                  Added
                                </Badge>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {intakeError && (
                        <p role="alert" className="text-sm font-medium text-destructive">
                          {intakeError}
                        </p>
                      )}
                      {intakeMessage && (
                        <p role="status" className="text-sm font-medium text-emerald-700">
                          {intakeMessage}
                        </p>
                      )}

                      <Button
                        type="button"
                        disabled={selectedOffcutCount === 0 || addingOffcuts}
                        onClick={() => void handleAddOffcuts()}
                      >
                        {addingOffcuts ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Add selected to inventory
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
