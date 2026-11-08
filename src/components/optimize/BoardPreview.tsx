import { SheetDiagram } from '@/components/optimize/CutPlanSheet';
import { Button } from '@/components/ui/button';
import type { PlannerBoard } from '@/lib/planner';
import { boardTitle } from '@/lib/plannerExport';

function boardMembers(board: PlannerBoard): string[] {
  return Array.from(
    new Set(
      board.panels.flatMap((panel) => (panel.memberLabel ? [panel.memberLabel] : [])),
    ),
  );
}

export function BoardPreview({
  board,
  memberColors,
  highlightPanelIds,
  focusedPanelId,
  onPanelClick,
  onExportSvg,
  onExportPng,
}: {
  board: PlannerBoard;
  memberColors: ReadonlyMap<string, string>;
  highlightPanelIds?: ReadonlySet<string>;
  focusedPanelId?: string;
  onPanelClick?: (panelId: string) => void;
  onExportSvg?: (board: PlannerBoard) => void;
  onExportPng?: (board: PlannerBoard) => void;
}) {
  if (!board.plan) return null;
  const members = boardMembers(board);
  const title = boardTitle(board);
  return (
    <div
      className="space-y-2 rounded-md border bg-background p-3"
      data-testid={`planner-board-${board.key}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">
          {members.length > 0 ? members.join(' · ') : 'New stock'}
        </p>
      </div>
      <SheetDiagram
        sheet={board.plan}
        memberColors={memberColors}
        svgId={`planner-${board.key}`}
        highlightPanelIds={highlightPanelIds}
        focusedPanelId={focusedPanelId}
        onPanelClick={onPanelClick}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {board.source === 'reuse' ? 'Reused board' : 'New stock'} ·{' '}
          {board.panels.length} panel{board.panels.length === 1 ? '' : 's'} ·{' '}
          {board.plan.utilization.toFixed(0)}% used
        </p>
        {onExportSvg && onExportPng && (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Export ${title} as SVG`}
              onClick={() => onExportSvg(board)}
            >
              SVG
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Export ${title} as PNG`}
              onClick={() => onExportPng(board)}
            >
              PNG
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
