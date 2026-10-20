import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlywoodSheetPlan } from '@/engine/types';
import { formatMeters } from '@/lib/format';
import { MEMBER_COLORS } from './memberColors';

const SHEET_PADDING = 0.09;
const PANEL_STROKE = '#0f172a';

export interface CutPlanSheetProps {
  sheet: PlywoodSheetPlan;
  memberColors: ReadonlyMap<string, string>;
  onExport?: () => void;
}

function panelFontSize(length: number, width: number): number {
  return Math.min(0.08, Math.max(0.028, Math.min(length, width) * 0.18));
}

export default function CutPlanSheet({ sheet, memberColors, onExport }: CutPlanSheetProps) {
  const { stock } = sheet;
  const stockArea = stock.length * stock.width;
  const reusableOffcutPercent =
    stockArea > 0 ? (sheet.reusableOffcutArea / stockArea) * 100 : 0;
  const viewBox = [
    -SHEET_PADDING,
    -SHEET_PADDING,
    stock.length + SHEET_PADDING * 2,
    stock.width + SHEET_PADDING * 2,
  ].join(' ');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">Sheet {sheet.sheetIndex + 1}</h3>
          <p className="text-sm text-muted-foreground">
            {formatMeters(stock.length)} × {formatMeters(stock.width)}
          </p>
        </div>
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
      </div>

      <svg
        id={`cut-plan-sheet-${sheet.sheetIndex}`}
        data-testid={`cut-plan-sheet-${sheet.sheetIndex}`}
        viewBox={viewBox}
        role="img"
        aria-label={`Cutting plan for sheet ${sheet.sheetIndex + 1}`}
        className="w-full rounded-md border bg-white"
      >
        <defs>
          <pattern
            id={`waste-hatch-${sheet.sheetIndex}`}
            width="0.08"
            height="0.08"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="0.08" height="0.08" fill="#fee2e2" />
            <line x1="0" y1="0" x2="0" y2="0.08" stroke="#dc2626" strokeWidth="0.018" />
          </pattern>
          <pattern
            id={`reusable-hatch-${sheet.sheetIndex}`}
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
          data-testid={`stock-sheet-outline-${sheet.sheetIndex}`}
          x={0}
          y={0}
          width={stock.length}
          height={stock.width}
          fill="#ffffff"
          stroke="#111827"
          strokeWidth={0.012}
        />

        <text
          data-testid={`stock-dimensions-${sheet.sheetIndex}`}
          x={stock.length / 2}
          y={-0.025}
          textAnchor="middle"
          fontSize={0.055}
          fill="#374151"
        >
          {formatMeters(stock.length)} × {formatMeters(stock.width)}
        </text>

        {sheet.offcuts.map((offcut, index) => (
          <rect
            key={`offcut-${index}`}
            data-testid={`offcut-${sheet.sheetIndex}-${index}`}
            data-reusable={offcut.reusable}
            x={offcut.x}
            y={offcut.y}
            width={offcut.length}
            height={offcut.width}
            fill={`url(#${offcut.reusable ? 'reusable' : 'waste'}-hatch-${sheet.sheetIndex})`}
            stroke={offcut.reusable ? '#9ca3af' : '#fca5a5'}
            strokeWidth={0.004}
          />
        ))}

        {sheet.panels.map((panel) => {
          const fill = memberColors.get(panel.sourceMemberLabel) ?? MEMBER_COLORS[0];
          const centerX = panel.x + panel.length / 2;
          const centerY = panel.y + panel.width / 2;
          const fontSize = panelFontSize(panel.length, panel.width);
          const label = panel.label || panel.sourceMemberLabel;

          return (
            <g
              key={panel.panelId}
              data-testid={`panel-${panel.panelId}`}
              data-rotated={String(panel.rotated)}
            >
              <rect
                x={panel.x}
                y={panel.y}
                width={panel.length}
                height={panel.width}
                fill={fill}
                stroke={PANEL_STROKE}
                strokeWidth={0.008}
              />
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
              >
                <tspan x={centerX} y={centerY - fontSize * 0.4} fontSize={fontSize} fontWeight={600}>
                  {label}
                </tspan>
                <tspan x={centerX} y={centerY + fontSize * 0.8} fontSize={fontSize * 0.8}>
                  {panel.length.toFixed(2)} × {panel.width.toFixed(2)} m
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>

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
    </div>
  );
}
