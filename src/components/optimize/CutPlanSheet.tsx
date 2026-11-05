import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlacedPanel, PlywoodSheetPlan } from '@/engine/types';
import { formatMeters } from '@/lib/format';
import { MEMBER_COLORS } from './memberColors';

const SHEET_PADDING = 0.09;
const PANEL_STROKE = '#0f172a';
const LABEL_LINE_HEIGHT = 1.15;

export interface SheetDiagramProps {
  sheet: PlywoodSheetPlan;
  memberColors: ReadonlyMap<string, string>;
  svgId?: string;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
  highlightPanelIds?: ReadonlySet<string>;
}

export interface CutPlanSheetProps {
  sheet: PlywoodSheetPlan;
  memberColors: ReadonlyMap<string, string>;
  onExport?: () => void;
  onExportPng?: () => void;
}

function panelFontSize(length: number, width: number): number {
  return Math.min(0.08, Math.max(0.028, Math.min(length, width) * 0.18));
}

interface PanelLabelLine {
  text: string;
  fontSize: number;
  fontWeight?: number;
  fill: string;
  y: number;
}

/**
 * Lay out every panel label line at an explicit baseline.
 *
 * Do not reintroduce `dominantBaseline` here. Firefox applies the text
 * baseline shift on top of the absolute `y` of child tspans, which pushes the
 * whole label block below its panel (Chrome happens to render it correctly).
 * One `<text>` per line with a plain alphabetic `y` renders consistently.
 */
function panelLabelLines(panel: PlacedPanel): PanelLabelLine[] {
  const fontSize = panelFontSize(panel.length, panel.width);
  const lines = [
    { text: panel.label, fontSize, fontWeight: 600, fill: '#0f172a' },
    {
      text: `${panel.length.toFixed(2)} × ${panel.width.toFixed(2)} m`,
      fontSize: fontSize * 0.8,
      fill: '#0f172a',
    },
    ...(panel.rotated
      ? [{ text: 'rotated', fontSize: fontSize * 0.62, fill: '#475569' }]
      : []),
  ];
  const lineHeights = lines.map((line) => line.fontSize * LABEL_LINE_HEIGHT);
  let cursor =
    panel.y +
    panel.width / 2 -
    lineHeights.reduce((total, height) => total + height, 0) / 2;

  return lines.map((line, index) => {
    const baseline = cursor + line.fontSize * 0.8;
    cursor += lineHeights[index] ?? 0;
    return { ...line, y: baseline };
  });
}

export function SheetDiagram({
  sheet,
  memberColors,
  svgId = `cut-plan-sheet-${sheet.sheetIndex}`,
  className = '',
  decorative = false,
  ariaLabel,
  highlightPanelIds,
}: SheetDiagramProps) {
  const { stock } = sheet;
  const patternKey =
    svgId === `cut-plan-sheet-${sheet.sheetIndex}`
      ? String(sheet.sheetIndex)
      : svgId.replace(/[^a-zA-Z0-9_-]/g, '-');
  // Lay portrait stock on its side so long, narrow pieces stay compact instead
  // of rendering as a very tall SVG at full container width.
  const transposed = stock.width > stock.length;
  const displayWidth = transposed ? stock.width : stock.length;
  const displayHeight = transposed ? stock.length : stock.width;
  const viewBox = [
    -SHEET_PADDING,
    -SHEET_PADDING,
    displayWidth + SHEET_PADDING * 2,
    displayHeight + SHEET_PADDING * 2,
  ].join(' ');

  return (
    <svg
      id={svgId}
      data-testid={decorative ? undefined : svgId}
      viewBox={viewBox}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : (ariaLabel ?? `Cutting plan for sheet ${sheet.sheetIndex + 1}`)
      }
      className={`w-full rounded-md border bg-white ${className}`.trim()}
    >
      <defs>
        <pattern
          id={`waste-hatch-${patternKey}`}
          width="0.08"
          height="0.08"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="0.08" height="0.08" fill="#fee2e2" />
          <line x1="0" y1="0" x2="0" y2="0.08" stroke="#dc2626" strokeWidth="0.018" />
        </pattern>
        <pattern
          id={`reusable-hatch-${patternKey}`}
          width="0.08"
          height="0.08"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="0.08" height="0.08" fill="#f3f4f6" />
          <line x1="0" y1="0" x2="0" y2="0.08" stroke="#6b7280" strokeWidth="0.018" />
        </pattern>
      </defs>

      <rect
        data-testid={decorative ? undefined : `stock-sheet-outline-${sheet.sheetIndex}`}
        x={0}
        y={0}
        width={displayWidth}
        height={displayHeight}
        fill="#ffffff"
        stroke="#111827"
        strokeWidth={0.012}
      />

      {!decorative && (
        <text
          data-testid={`stock-dimensions-${sheet.sheetIndex}`}
          x={displayWidth / 2}
          y={-0.025}
          textAnchor="middle"
          fontSize={0.055}
          fill="#374151"
        >
          {formatMeters(stock.length)} × {formatMeters(stock.width)}
        </text>
      )}

      {sheet.offcuts.map((offcut, index) => (
        <rect
          key={`offcut-${index}`}
          data-testid={decorative ? undefined : `offcut-${sheet.sheetIndex}-${index}`}
          data-reusable={offcut.reusable}
          x={transposed ? offcut.y : offcut.x}
          y={transposed ? offcut.x : offcut.y}
          width={transposed ? offcut.width : offcut.length}
          height={transposed ? offcut.length : offcut.width}
          fill={`url(#${offcut.reusable ? 'reusable' : 'waste'}-hatch-${patternKey})`}
          stroke={offcut.reusable ? '#9ca3af' : '#fca5a5'}
          strokeWidth={0.004}
        />
      ))}

      {sheet.panels.map((panel) => {
        const fill = memberColors.get(panel.label) ?? MEMBER_COLORS[0];
        const highlighted =
          !highlightPanelIds || highlightPanelIds.has(panel.panelId);

        return (
          <g
            key={panel.panelId}
            data-testid={decorative ? undefined : `panel-${panel.panelId}`}
            data-rotated={String(panel.rotated)}
            data-highlighted={highlightPanelIds ? String(highlighted) : undefined}
            opacity={highlighted ? 1 : 0.2}
          >
            <rect
              x={transposed ? panel.y : panel.x}
              y={transposed ? panel.x : panel.y}
              width={transposed ? panel.width : panel.length}
              height={transposed ? panel.length : panel.width}
              fill={fill}
              stroke={PANEL_STROKE}
              strokeWidth={0.008}
            />
          </g>
        );
      })}

      {!decorative &&
        sheet.panels.map((panel) => {
          const centerX = transposed
            ? panel.y + panel.width / 2
            : panel.x + panel.length / 2;
          const centerY = transposed
            ? panel.x + panel.length / 2
            : panel.y + panel.width / 2;
          const offsetY = centerY - (panel.y + panel.width / 2);
          const highlighted =
            !highlightPanelIds || highlightPanelIds.has(panel.panelId);

          return panelLabelLines(panel).map((line, index) => (
            <text
              key={`label-${panel.panelId}-${index}`}
              data-testid={`panel-label-${panel.panelId}-${index}`}
              data-panel-label={panel.panelId}
              x={centerX}
              y={line.y + offsetY}
              textAnchor="middle"
              fontSize={line.fontSize}
              fontWeight={line.fontWeight}
              fill={line.fill}
              opacity={highlighted ? 1 : 0.2}
            >
              {line.text}
            </text>
          ));
        })}
    </svg>
  );
}

export function SheetPanelLegend({
  sheet,
  memberColors,
  testId,
}: {
  sheet: PlywoodSheetPlan;
  memberColors: ReadonlyMap<string, string>;
  testId?: string;
}) {
  if (sheet.panels.length === 0) return null;

  return (
    <ul
      data-testid={testId}
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {sheet.panels.map((panel, index) => (
        <li key={`${panel.panelId}-${index}`} className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-sm border border-foreground/30"
            style={{ backgroundColor: memberColors.get(panel.label) ?? MEMBER_COLORS[0] }}
          />
          <span className="font-medium text-foreground">{panel.label}</span>
          <span>
            {formatMeters(panel.length)} × {formatMeters(panel.width)}
            {panel.rotated ? ' · rotated' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SheetNotes({ sheet }: { sheet: PlywoodSheetPlan }) {
  const stockArea = sheet.stock.length * sheet.stock.width;
  const reusableOffcutPercent =
    stockArea > 0 ? (sheet.reusableOffcutArea / stockArea) * 100 : 0;

  return (
    <>
      <p data-testid={`sheet-stats-${sheet.sheetIndex}`} className="text-sm text-muted-foreground">
        Utilization {sheet.utilization.toFixed(1)}% · Waste {sheet.waste.toFixed(1)}% · Reusable
        offcuts {reusableOffcutPercent.toFixed(1)}%
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border border-red-400 bg-red-100" />
          Red hatch = waste
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border border-gray-400 bg-gray-100" />
          Gray hatch = reusable offcut
        </span>
      </p>
    </>
  );
}

export default function CutPlanSheet({
  sheet,
  memberColors,
  onExport,
  onExportPng,
}: CutPlanSheetProps) {
  const { stock } = sheet;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">Sheet {sheet.sheetIndex + 1}</h3>
          <p className="text-sm text-muted-foreground">
            {formatMeters(stock.length)} × {formatMeters(stock.width)}
          </p>
        </div>
        {(onExport || onExportPng) && (
          <div className="flex flex-wrap gap-2">
            {onExport && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Export sheet ${sheet.sheetIndex + 1} as SVG`}
                onClick={onExport}
              >
                <Download className="h-4 w-4" /> Export SVG
              </Button>
            )}
            {onExportPng && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Export sheet ${sheet.sheetIndex + 1} as PNG`}
                onClick={onExportPng}
              >
                <Download className="h-4 w-4" /> Export PNG
              </Button>
            )}
          </div>
        )}
      </div>

      <SheetDiagram sheet={sheet} memberColors={memberColors} />
      <SheetNotes sheet={sheet} />
    </div>
  );
}
