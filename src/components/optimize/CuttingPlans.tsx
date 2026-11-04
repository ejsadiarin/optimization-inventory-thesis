import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoHint } from '@/components/ui/info-hint';
import type {
  OptimizationResult,
  PlywoodSheetPlan,
  ReuseAllocation,
} from '@/engine/types';
import {
  crossSectionLabel,
  formatDate,
  formatMeters,
  shortId,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { MEMBER_COLORS } from './memberColors';
import { SheetDiagram, SheetNotes, SheetPanelLegend } from './CutPlanSheet';
import OffcutIntake from './OffcutIntake';
import type { ReusableOffcutEntry } from './offcuts';

type CutSegment = 'sheets' | 'lumber' | 'offcuts';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const SWIPE_THRESHOLD = 50;

function touchDistance(
  touches: ArrayLike<{ clientX: number; clientY: number }>,
): number {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return 0;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

interface SheetWorkspaceProps {
  sheets: readonly PlywoodSheetPlan[];
  memberColors: ReadonlyMap<string, string>;
  onExportSheet: (sheetIndex: number) => void;
  onExportSheetPng: (sheetIndex: number) => void;
}

function SheetWorkspace({
  sheets,
  memberColors,
  onExportSheet,
  onExportSheetPng,
}: SheetWorkspaceProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [listView, setListView] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const swipeStartRef = useRef<number | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const index = Math.min(selectedIndex, sheets.length - 1);
  const sheet = sheets[index];

  useEffect(() => {
    if (selectedIndex > sheets.length - 1) setSelectedIndex(0);
  }, [selectedIndex, sheets.length]);

  if (!sheet) return null;

  function selectSheet(next: number) {
    setSelectedIndex(Math.max(0, Math.min(sheets.length - 1, next)));
  }

  function openFullscreen() {
    setZoom(ZOOM_MIN);
    setFullscreenOpen(true);
  }

  function handleSwipeStart(event: React.TouchEvent) {
    swipeStartRef.current =
      event.touches.length === 1 ? event.touches[0]!.clientX : null;
  }

  function handleSwipeEnd(event: React.TouchEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (start === null || !touch) return;
    const delta = touch.clientX - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    selectSheet(delta < 0 ? index + 1 : index - 1);
  }

  function handlePinchStart(event: React.TouchEvent) {
    pinchRef.current =
      event.touches.length === 2
        ? { distance: touchDistance(event.touches), zoom }
        : null;
  }

  function handlePinchMove(event: React.TouchEvent) {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
    const ratio = touchDistance(event.touches) / pinch.distance;
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinch.zoom * ratio)));
  }

  function handlePinchEnd(event: React.TouchEvent) {
    if (event.touches.length < 2) pinchRef.current = null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">Plywood sheets</h3>
          <p
            className="text-sm text-muted-foreground"
            data-testid="sheet-counter"
            aria-live="polite"
          >
            Sheet {index + 1} of {sheets.length}
          </p>
        </div>
        <div className="flex gap-1 sm:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Previous sheet"
            disabled={index === 0}
            onClick={() => selectSheet(index - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Next sheet"
            disabled={index === sheets.length - 1}
            onClick={() => selectSheet(index + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Sheet thumbnails"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible"
      >
        {sheets.map((item, itemIndex) => (
          <button
            key={item.sheetIndex}
            type="button"
            aria-label={`Select sheet ${itemIndex + 1}`}
            aria-pressed={itemIndex === index}
            data-testid={`sheet-thumbnail-${itemIndex}`}
            onClick={() => selectSheet(itemIndex)}
            className={cn(
              'min-w-[8rem] shrink-0 snap-start rounded-md border p-1 text-left transition-colors sm:min-w-0',
              itemIndex === index
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent',
            )}
          >
            <SheetDiagram
              sheet={item}
              memberColors={memberColors}
              svgId={`cut-plan-thumb-${itemIndex}`}
              className="border-0"
              decorative
            />
            <span className="mt-1 block px-1 text-xs font-medium">
              Sheet {itemIndex + 1}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={listView}
          onClick={() => setListView((current) => !current)}
        >
          {listView ? 'Diagram view' : 'List view'}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Export sheet ${index + 1} as SVG`}
            onClick={() => onExportSheet(sheet.sheetIndex)}
          >
            <Download className="h-4 w-4" /> Export SVG
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Export sheet ${index + 1} as PNG`}
            onClick={() => onExportSheetPng(sheet.sheetIndex)}
          >
            <Download className="h-4 w-4" /> Export PNG
          </Button>
        </div>
      </div>

      <div
        data-testid="selected-sheet-detail"
        className="space-y-2"
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        {listView ? (
          <ul data-testid="sheet-panel-list" className="divide-y rounded-md border">
            {sheet.panels.map((panel) => (
              <li
                key={panel.panelId}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor:
                        memberColors.get(panel.label) ?? MEMBER_COLORS[0],
                    }}
                  />
                  <span className="font-medium">{panel.label}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatMeters(panel.length)} × {formatMeters(panel.width)}
                  {panel.rotated ? ' · rotated' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Open sheet ${index + 1} fullscreen`}
              onClick={openFullscreen}
              className="group relative block w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <SheetDiagram sheet={sheet} memberColors={memberColors} />
              <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow">
                <Maximize2 className="h-3 w-3" /> Fullscreen
              </span>
            </button>
            <SheetNotes sheet={sheet} />
          </>
        )}
      </div>

      <div className="hidden" aria-hidden="true">
        {sheets
          .filter((item) => item.sheetIndex !== sheet.sheetIndex)
          .map((item) => (
            <SheetDiagram
              key={item.sheetIndex}
              sheet={item}
              memberColors={memberColors}
              decorative
            />
          ))}
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="max-w-none sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sheet {index + 1}</DialogTitle>
            <DialogDescription>
              Pinch or use the zoom controls to inspect the cutting plan.
            </DialogDescription>
          </DialogHeader>
          <div
            data-testid="sheet-zoom-area"
            className="overflow-auto rounded-md border bg-white"
            onTouchStart={handlePinchStart}
            onTouchMove={handlePinchMove}
            onTouchEnd={handlePinchEnd}
          >
            <div className="mx-auto" style={{ width: `${zoom * 100}%` }}>
              <SheetDiagram
                sheet={sheet}
                memberColors={memberColors}
                svgId={`cut-plan-sheet-${sheet.sheetIndex}-fullscreen`}
                className="rounded-none border-0"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Zoom <span data-testid="sheet-zoom-level">{Math.round(zoom * 100)}%</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => setZoom((current) => Math.max(ZOOM_MIN, current - ZOOM_STEP))}
              >
                −
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => setZoom((current) => Math.min(ZOOM_MAX, current + ZOOM_STEP))}
              >
                +
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Reset zoom"
                disabled={zoom === ZOOM_MIN}
                onClick={() => setZoom(ZOOM_MIN)}
              >
                Reset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface CuttingPlansProps {
  optimization: OptimizationResult;
  memberColors: ReadonlyMap<string, string>;
  reuseAllocations: readonly ReuseAllocation[];
  reusableOffcuts: readonly ReusableOffcutEntry[];
  selectedOffcutKeys: ReadonlySet<string>;
  addedOffcutKeys: ReadonlySet<string>;
  addingOffcuts: boolean;
  intakeError: string;
  cutPlansReviewedAt: string | null;
  onToggleOffcut: (key: string, checked: boolean) => void;
  onAddOffcuts: () => void;
  onExportSheet: (sheetIndex: number) => void;
  onExportSheetPng: (sheetIndex: number) => void;
  onExportAllSheets: () => void;
}

export default function CuttingPlans({
  optimization,
  memberColors,
  reuseAllocations,
  reusableOffcuts,
  selectedOffcutKeys,
  addedOffcutKeys,
  addingOffcuts,
  intakeError,
  cutPlansReviewedAt,
  onToggleOffcut,
  onAddOffcuts,
  onExportSheet,
  onExportSheetPng,
  onExportAllSheets,
}: CuttingPlansProps) {
  const remainingCount =
    optimization.remainingPanels.length + optimization.remainingLumberRequirements.length;
  const hasPanels = optimization.remainingPanels.length > 0;
  const defaultSegment: CutSegment =
    remainingCount === 0 && reusableOffcuts.length > 0
      ? 'offcuts'
      : hasPanels
        ? 'sheets'
        : 'lumber';
  const [selectedSegment, setSelectedSegment] = useState<CutSegment | null>(null);
  const segment = selectedSegment ?? defaultSegment;

  const counts: Record<CutSegment, number> = {
    sheets: optimization.plywood.sheets.length,
    lumber: optimization.lumber.stockPiecesUsed,
    offcuts: reusableOffcuts.length,
  };
  const segments: ReadonlyArray<{ id: CutSegment; label: string }> = [
    { id: 'sheets', label: 'Sheets' },
    { id: 'lumber', label: 'Lumber' },
    { id: 'offcuts', label: 'Offcuts' },
  ];
  const utilization = hasPanels
    ? optimization.plywood.utilization
    : optimization.lumber.utilization;
  const returnedOffcuts = addedOffcutKeys.size;
  const unplacedPanels = optimization.plywood.unplacedPanels;
  const unplacedLumber = optimization.lumber.unplacedRequirements;
  const unplacedCount = unplacedPanels.length + unplacedLumber.length;

  return (
    <section className="space-y-4 border-t pt-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Cutting plans</h2>
        <p className="text-sm text-muted-foreground">
          Plans for requirements not covered by reused inventory.
        </p>
        {cutPlansReviewedAt && (
          <p className="text-xs text-muted-foreground" data-testid="cut-plans-reviewed">
            Cut plans reviewed {formatDate(cutPlansReviewedAt)}
          </p>
        )}
      </div>

      <Card>
        <CardContent
          data-testid="cut-summary"
          className="grid grid-cols-2 gap-2 py-4 text-sm sm:grid-cols-3"
        >
          <div>
            <p className="text-muted-foreground">Sheets used</p>
            <p className="font-semibold">{optimization.stats.plywood.sheetsUsed}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Sheets saved</p>
            <p className="font-semibold">{optimization.stats.plywood.sheetsSaved}</p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {hasPanels ? 'Sheet utilization' : 'Lumber utilization'}
            </p>
            <p className="font-semibold" data-testid="cut-utilization">
              {utilization.toFixed(1)}%
            </p>
          </div>
          {optimization.plywood.sheets.length > 0 && (
            <div className="col-span-2 flex justify-end border-t pt-2 sm:col-span-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Export all sheets"
                onClick={onExportAllSheets}
              >
                <Download className="h-4 w-4" /> Export all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {unplacedCount > 0 && (
        <Card className="border-amber-300 bg-amber-50/60" data-testid="cut-unplaced">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Unplaced ({unplacedCount})
              </CardTitle>
              <InfoHint label="Unplaced items">
                Panels need a larger phenolic sheet; lumber needs a longer stock length.
                Change either in Settings.
              </InfoHint>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {unplacedPanels.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Panels</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {unplacedPanels.map((panel) => (
                    <li key={panel.panelId} data-testid="unplaced-panel">
                      {panel.label} · {formatMeters(panel.length)} ×{' '}
                      {formatMeters(panel.width)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unplacedLumber.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Lumber</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {unplacedLumber.map((requirement) => (
                    <li key={requirement.requirementId} data-testid="unplaced-lumber">
                      {requirement.label} · {formatMeters(requirement.length)} ·{' '}
                      {crossSectionLabel(requirement.crossSection)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button asChild size="sm" variant="outline">
              <Link to="../settings">Review stock sizes</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {reuseAllocations.length > 0 && (
        <Card data-testid="reused-pieces">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Reused pieces ({reuseAllocations.length})
            </CardTitle>
            <CardDescription>
              Nested panels from reusable inventory. Dimensions are exact and include
              no saw kerf or blade allowance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reuseAllocations.map((allocation, index) => (
              <div
                key={allocation.pieceId}
                data-testid={`reused-piece-${index}`}
                className="space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-sm font-semibold">
                    {shortId(allocation.pieceId)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatMeters(allocation.plan.stock.length)} ×{' '}
                    {formatMeters(allocation.plan.stock.width)} ·{' '}
                    {allocation.panelIds.length} panel
                    {allocation.panelIds.length === 1 ? '' : 's'}
                  </p>
                </div>
                <SheetDiagram
                  sheet={allocation.plan}
                  memberColors={memberColors}
                  svgId={`reused-piece-svg-${index}`}
                />
                <SheetPanelLegend
                  sheet={allocation.plan}
                  memberColors={memberColors}
                  testId={`reused-piece-legend-${index}`}
                />
                <SheetNotes sheet={allocation.plan} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {remainingCount === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium">No cuts needed</p>
            <p className="text-sm text-muted-foreground">
              All requirements are satisfied by reused pieces. No new stock sheets or lumber
              pieces need to be cut.
            </p>
          </CardContent>
        </Card>
      )}

      {remainingCount > 0 || reusableOffcuts.length > 0 ? (
        <>
          <Tabs
            value={segment}
            onValueChange={(value) => setSelectedSegment(value as CutSegment)}
          >
            <TabsList className="grid w-full grid-cols-3">
              {segments.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="w-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {item.label} ({counts[item.id]})
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="sheets" className="space-y-3">
                {optimization.plywood.sheets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No plywood panels can be placed on the configured stock sheet.
                  </p>
                ) : (
                  <SheetWorkspace
                    sheets={optimization.plywood.sheets}
                    memberColors={memberColors}
                    onExportSheet={onExportSheet}
                    onExportSheetPng={onExportSheetPng}
                  />
                )}
            </TabsContent>

            <TabsContent value="lumber" className="space-y-3">
                <h3 className="font-semibold">Lumber cuts</h3>

                {optimization.lumber.groups.length === 0 &&
                  optimization.lumber.unplacedRequirements.length === 0 && (
                    <p className="text-sm text-muted-foreground">No lumber cuts needed.</p>
                  )}

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
                            Stock {stock.stockIndex + 1} · {formatMeters(stock.stockLength)} ·
                            offcut {formatMeters(stock.offcutLength)}
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
            </TabsContent>

            <TabsContent value="offcuts" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {reusableOffcuts.length === 0 && (
                    <h3 className="font-semibold">Reusable offcuts</h3>
                  )}
                  <p
                    className="ml-auto text-sm text-muted-foreground"
                    data-testid="offcut-completion"
                  >
                    {returnedOffcuts} offcut{returnedOffcuts === 1 ? '' : 's'} returned
                  </p>
                </div>

                {reusableOffcuts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No reusable offcuts from this plan.
                  </p>
                ) : (
                  <OffcutIntake
                    reusableOffcuts={reusableOffcuts}
                    selectedOffcutKeys={selectedOffcutKeys}
                    addedOffcutKeys={addedOffcutKeys}
                    addingOffcuts={addingOffcuts}
                    intakeError={intakeError}
                    onToggleOffcut={onToggleOffcut}
                    onAddOffcuts={onAddOffcuts}
                  />
                )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </section>
  );
}
