import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CutPlanSheet from './CutPlanSheet';
import { buildMemberColorMap } from './memberColors';
import type { PlywoodSheetPlan } from '@/engine/types';

const STOCK = { length: 2.44, width: 1.22 };

function sheetPlan(overrides: Partial<PlywoodSheetPlan> = {}): PlywoodSheetPlan {
  return {
    sheetIndex: 0,
    stock: STOCK,
    panels: [
      {
        panelId: 'C1-panel-1',
        label: 'C1',
        sourceMemberLabel: 'C1',
        x: 0,
        y: 0,
        length: 1.22,
        width: 0.5,
        rotated: false,
      },
      {
        panelId: 'B1-panel-1',
        label: 'B1',
        sourceMemberLabel: 'B1',
        x: 0,
        y: 0.5,
        length: 0.6,
        width: 1,
        rotated: true,
      },
    ],
    offcuts: [
      { x: 1.22, y: 0, length: 1.22, width: 0.5, reusable: true },
      { x: 1.22, y: 0.5, length: 0.1, width: 0.1, reusable: false },
    ],
    usedArea: 1.21,
    offcutArea: 0.62,
    reusableOffcutArea: 0.61,
    wasteArea: 0.01,
    utilization: 40.7,
    waste: 0.3,
    ...overrides,
  };
}

const COLORS = buildMemberColorMap(['C1', 'B1']);

function renderSheet(overrides: Partial<PlywoodSheetPlan> = {}) {
  return render(<CutPlanSheet sheet={sheetPlan(overrides)} memberColors={COLORS} />);
}

function panelRect(panelId: string): SVGRectElement {
  const group = screen.getByTestId(`panel-${panelId}`);
  const rect = group.querySelector('rect');
  if (!rect) throw new Error(`panel ${panelId} has no rectangle`);
  return rect as SVGRectElement;
}

describe('CutPlanSheet', () => {
  it('renders a dark stock sheet outline with a stable id and dimensions label', () => {
    renderSheet();

    expect(screen.getByTestId('cut-plan-sheet-0')).toHaveAttribute('id', 'cut-plan-sheet-0');
    expect(screen.getByTestId('stock-sheet-outline-0')).toHaveAttribute('stroke', '#111827');
    expect(screen.getByTestId('stock-dimensions-0')).toHaveTextContent('2.44 m × 1.22 m');
    expect(screen.getByText(/sheet 1/i)).toBeInTheDocument();
  });

  it('draws each placed panel with its member color and placed geometry', () => {
    renderSheet();

    const first = panelRect('C1-panel-1');
    expect(first).toHaveAttribute('x', '0');
    expect(first).toHaveAttribute('y', '0');
    expect(first).toHaveAttribute('width', '1.22');
    expect(first).toHaveAttribute('height', '0.5');
    expect(first).toHaveAttribute('fill', COLORS.get('C1'));

    const rotated = panelRect('B1-panel-1');
    expect(rotated).toHaveAttribute('width', '0.6');
    expect(rotated).toHaveAttribute('height', '1');
    expect(rotated).toHaveAttribute('fill', COLORS.get('B1'));
    expect(screen.getByTestId('panel-B1-panel-1')).toHaveAttribute('data-rotated', 'true');
  });

  it('labels panels with their member label and dimensions in meters', () => {
    renderSheet();

    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('1.22 × 0.50 m')).toBeInTheDocument();
    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.getByText('0.60 × 1.00 m')).toBeInTheDocument();
  });

  it('hatches reusable offcuts gray and waste red', () => {
    renderSheet();

    expect(screen.getByTestId('offcut-0-0')).toHaveAttribute(
      'fill',
      'url(#reusable-hatch-0)',
    );
    expect(screen.getByTestId('offcut-0-1')).toHaveAttribute(
      'fill',
      'url(#waste-hatch-0)',
    );

    const reusable = document.querySelector('#reusable-hatch-0');
    const waste = document.querySelector('#waste-hatch-0');
    expect(reusable).not.toBeNull();
    expect(waste).not.toBeNull();
    expect(reusable?.querySelector('line')).toHaveAttribute('stroke', '#6b7280');
    expect(waste?.querySelector('line')).toHaveAttribute('stroke', '#dc2626');
  });

  it('reports sheet utilization, waste, and reusable offcut stats', () => {
    renderSheet();

    const stats = screen.getByTestId('sheet-stats-0');
    expect(stats).toHaveTextContent('Utilization 40.7%');
    expect(stats).toHaveTextContent('Waste 0.3%');
    expect(stats).toHaveTextContent('Reusable offcuts 20.5%');
    expect(screen.getByText(/red hatch = waste/i)).toBeInTheDocument();
    expect(screen.getByText(/gray hatch = reusable offcut/i)).toBeInTheDocument();
  });
});
