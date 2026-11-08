import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { shortId } from '@/lib/format';
import type { PlannerBoard } from '@/lib/planner';

export function boardTitle(board: PlannerBoard): string {
  return board.pieceId
    ? shortId(board.pieceId)
    : `Stock sheet ${(board.plan?.sheetIndex ?? 0) + 1}`;
}

export function boardExportLabel(board: PlannerBoard): string {
  if (board.source === 'reuse' && board.pieceId) {
    return `reused-board-${shortId(board.pieceId)}`;
  }
  return `stock-sheet-${(board.plan?.sheetIndex ?? 0) + 1}`;
}

/**
 * Export the SVG rendered for a board. `BoardPreview` gives every board an
 * element id of `planner-<board.key>`.
 */
export function exportPlannerBoard(
  board: PlannerBoard,
  projectName: string,
  extension: 'svg' | 'png',
  onError: (message: string) => void,
): void {
  const element = document.getElementById(`planner-${board.key}`);
  if (!element || element.tagName.toLowerCase() !== 'svg') {
    onError('Could not find the cutting plan board to export.');
    return;
  }
  const filename = buildDatedFilename(
    projectName,
    boardExportLabel(board),
    extension,
  );
  const svg = element as unknown as SVGSVGElement;
  if (extension === 'svg') {
    downloadSvgAsFile(filename, svg);
    return;
  }
  void downloadSvgAsPng(filename, svg).catch(() => {
    onError('Could not export the cutting plan image.');
  });
}
