import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BoardPreview } from '@/components/optimize/BoardPreview';
import { SheetDiagram } from '@/components/optimize/CutPlanSheet';
import { Button } from '@/components/ui/button';
import type { PlannerBoard } from '@/lib/planner';
import { boardTitle, exportPlannerBoard } from '@/lib/plannerExport';

export default function MemberBoardViewer({
  boards,
  projectName,
  memberColors,
  highlightPanelIds,
  focusedPanelId,
  onPanelClick,
  onError,
}: {
  boards: readonly PlannerBoard[];
  projectName: string;
  memberColors: ReadonlyMap<string, string>;
  highlightPanelIds?: ReadonlySet<string>;
  focusedPanelId?: string;
  onPanelClick?: (panelId: string) => void;
  onError: (message: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const orderedBoards = useMemo(
    () => [
      ...boards.filter((board) => board.source === 'reuse'),
      ...boards.filter((board) => board.source === 'new_stock'),
    ],
    [boards],
  );

  const selectedIndex = Math.max(
    0,
    orderedBoards.findIndex((board) => board.key === selectedKey),
  );
  const board = orderedBoards[selectedIndex];

  useEffect(() => {
    if (!focusedPanelId) return;
    const index = orderedBoards.findIndex((item) =>
      item.panels.some((panel) => panel.panelId === focusedPanelId),
    );
    if (index >= 0) setSelectedKey(orderedBoards[index]!.key);
  }, [focusedPanelId, orderedBoards]);

  if (!board) return null;

  function selectBoard(index: number) {
    const wrapped = (index + orderedBoards.length) % orderedBoards.length;
    setSelectedKey(orderedBoards[wrapped]!.key);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectBoard(selectedIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectBoard(selectedIndex + 1);
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="planner-board-viewer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Member cutting plans"
      className="space-y-3 rounded-lg border bg-background p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Cutting plans</h2>
        <span className="text-xs text-muted-foreground">
          {selectedIndex + 1} of {orderedBoards.length}
        </span>
      </div>

      <BoardPreview
        board={board}
        memberColors={memberColors}
        highlightPanelIds={highlightPanelIds}
        focusedPanelId={focusedPanelId}
        onPanelClick={onPanelClick}
        onExportSvg={(item) =>
          exportPlannerBoard(item, projectName, 'svg', onError)
        }
        onExportPng={(item) =>
          exportPlannerBoard(item, projectName, 'png', onError)
        }
      />

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Previous board"
          onClick={() => selectBoard(selectedIndex - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="min-w-0 truncate text-sm font-medium">{boardTitle(board)}</p>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Next board"
          onClick={() => selectBoard(selectedIndex + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div
        data-testid="planner-board-thumbnails"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {orderedBoards.map((item, index) => (
          <button
            key={item.key}
            type="button"
            aria-label={`Show ${boardTitle(item)}`}
            aria-pressed={index === selectedIndex}
            onClick={() => setSelectedKey(item.key)}
            className={[
              'w-24 shrink-0 rounded-md border p-1 transition-colors',
              index === selectedIndex
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent',
            ].join(' ')}
          >
            {item.plan && (
              <SheetDiagram
                sheet={item.plan}
                memberColors={memberColors}
                svgId={`planner-thumb-${item.key}`}
                decorative
              />
            )}
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">
              {item.source === 'reuse' ? 'Reused' : 'New stock'} · {index + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
