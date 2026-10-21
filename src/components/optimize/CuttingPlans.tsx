import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OptimizationResult } from '@/engine/types';
import { crossSectionLabel, formatMeters, formatPeso } from '@/lib/format';
import CutPlanSheet from './CutPlanSheet';
import OffcutIntake from './OffcutIntake';
import type { ReusableOffcutEntry } from './offcuts';

export interface CuttingPlansProps {
  optimization: OptimizationResult;
  memberColors: ReadonlyMap<string, string>;
  reusableOffcuts: readonly ReusableOffcutEntry[];
  selectedOffcutKeys: ReadonlySet<string>;
  addedOffcutKeys: ReadonlySet<string>;
  addingOffcuts: boolean;
  intakeMessage: string;
  intakeError: string;
  onToggleOffcut: (key: string, checked: boolean) => void;
  onAddOffcuts: () => void;
  onExportSheet: (sheetIndex: number) => void;
  onExportSheetPng: (sheetIndex: number) => void;
  onExportAllSheets: () => void;
}

export default function CuttingPlans({
  optimization,
  memberColors,
  reusableOffcuts,
  selectedOffcutKeys,
  addedOffcutKeys,
  addingOffcuts,
  intakeMessage,
  intakeError,
  onToggleOffcut,
  onAddOffcuts,
  onExportSheet,
  onExportSheetPng,
  onExportAllSheets,
}: CuttingPlansProps) {
  const remainingCount =
    optimization.remainingPanels.length + optimization.remainingLumberRequirements.length;

  return (
    <section className="space-y-4 border-t pt-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Cutting plans</h2>
        <p className="text-sm text-muted-foreground">
          Plans for requirements not covered by reused inventory.
        </p>
      </div>

      {remainingCount === 0 ? (
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
                <p className="font-semibold">{formatPeso(optimization.stats.estimatedSavings)}</p>
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
                    onClick={onExportAllSheets}
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
                        onExport={() => onExportSheet(sheet.sheetIndex)}
                        onExportPng={() => onExportSheetPng(sheet.sheetIndex)}
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
                          Stock {stock.stockIndex + 1} · {formatMeters(stock.stockLength)} · offcut{' '}
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
                          {crossSectionLabel(requirement.crossSection)}) is longer than the longest
                          stock length.
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <OffcutIntake
            reusableOffcuts={reusableOffcuts}
            selectedOffcutKeys={selectedOffcutKeys}
            addedOffcutKeys={addedOffcutKeys}
            addingOffcuts={addingOffcuts}
            intakeMessage={intakeMessage}
            intakeError={intakeError}
            onToggleOffcut={onToggleOffcut}
            onAddOffcuts={onAddOffcuts}
          />
        </>
      )}
    </section>
  );
}
