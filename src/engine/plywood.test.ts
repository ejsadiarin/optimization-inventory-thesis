import { describe, expect, it } from 'vitest';
import { MIN_REUSABLE_OFFCUT, optimizePlywood } from './plywood';
import type { Offcut, PlacedPanel, PlywoodPanel } from './types';

const STOCK = { length: 2.44, width: 1.22 };
const STOCK_AREA = STOCK.length * STOCK.width;
const EPS = 1e-6;

function panel(id: string, length: number, width: number, label = id): PlywoodPanel {
  return { id, label, length, width };
}

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

function byId(panels: PlacedPanel[], id: string): PlacedPanel {
  const placed = panels.find((item) => item.panelId === id);
  if (!placed) throw new Error(`panel ${id} was not placed`);
  return placed;
}

interface Rect {
  x: number;
  y: number;
  length: number;
  width: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.length - EPS &&
    b.x < a.x + a.length - EPS &&
    a.y < b.y + b.width - EPS &&
    b.y < a.y + a.width - EPS
  );
}

function expectWithinStock(rect: Rect, index: number): void {
  expect(rect.x, `rect ${index} x`).toBeGreaterThanOrEqual(-EPS);
  expect(rect.y, `rect ${index} y`).toBeGreaterThanOrEqual(-EPS);
  expect(rect.x + rect.length, `rect ${index} right edge`).toBeLessThanOrEqual(
    STOCK.length + EPS,
  );
  expect(rect.y + rect.width, `rect ${index} bottom edge`).toBeLessThanOrEqual(
    STOCK.width + EPS,
  );
}

describe('optimizePlywood', () => {
  it('places a panel that exactly fills the stock sheet at 100% utilization', () => {
    const plan = optimizePlywood([panel('p1', STOCK.length, STOCK.width)], STOCK);

    expect(plan.sheetsUsed).toBe(1);
    expect(plan.unplacedPanels).toEqual([]);
    expect(plan.oversizedPanels).toEqual([]);

    const sheet = first(plan.sheets);
    expect(sheet.panels).toHaveLength(1);
    expect(sheet.utilization).toBeCloseTo(100);
    expect(sheet.waste).toBeCloseTo(0);
    expect(sheet.offcuts).toEqual([]);
    expect(plan.utilization).toBeCloseTo(100);
    expect(plan.waste).toBeCloseTo(0);
  });

  it('places a panel 1mm smaller than the stock and treats the slivers as waste', () => {
    const plan = optimizePlywood([panel('p1', 2.439, 1.219)], STOCK);

    const sheet = first(plan.sheets);
    expect(byId(sheet.panels, 'p1')).toMatchObject({
      x: 0,
      y: 0,
      length: 2.439,
      width: 1.219,
      rotated: false,
    });
    expect(sheet.utilization).toBeGreaterThan(99.8);
    expect(sheet.utilization).toBeLessThan(100);
    expect(sheet.offcuts.length).toBeGreaterThan(0);
    expect(sheet.offcuts.every((offcut) => !offcut.reusable)).toBe(true);
    expect(sheet.waste).toBeCloseTo(100 - sheet.utilization, 6);
  });

  it('rotates a panel when it only fits the stock sideways', () => {
    const plan = optimizePlywood([panel('p1', 0.6, 2.0)], STOCK);

    const placed = byId(first(plan.sheets).panels, 'p1');
    expect(placed).toMatchObject({
      x: 0,
      y: 0,
      length: 2.0,
      width: 0.6,
      rotated: true,
    });
    expectWithinStock(placed, 0);
  });

  it('rotates a panel into an existing shelf when that improves the fit', () => {
    const plan = optimizePlywood([panel('a', 1.9, 1.2), panel('b', 1.0, 0.4)], STOCK);

    expect(plan.sheetsUsed).toBe(1);
    const sheet = first(plan.sheets);
    expect(byId(sheet.panels, 'b')).toMatchObject({
      x: 1.9,
      y: 0,
      length: 0.4,
      width: 1.0,
      rotated: true,
    });
  });

  it('spills into additional stock sheets when the current sheet is full', () => {
    const panels = Array.from({ length: 4 }, (_, index) => panel(`p${index}`, 1.2, 1.2));

    const plan = optimizePlywood(panels, STOCK);

    expect(plan.sheetsUsed).toBe(2);
    expect(plan.sheets.map((sheet) => sheet.panels.length)).toEqual([2, 2]);
    expect(plan.unplacedPanels).toEqual([]);
  });

  it('places every panel within bounds without overlap and leaves guillotine shelves', () => {
    const panels = [
      ...Array.from({ length: 6 }, (_, index) => panel(`side-${index}`, 2.4, 0.4)),
      ...Array.from({ length: 3 }, (_, index) => panel(`bottom-${index}`, 2.4, 0.25)),
      ...Array.from({ length: 4 }, (_, index) => panel(`column-${index}`, 0.6, 2.0)),
    ];

    const plan = optimizePlywood(panels, STOCK);

    expect(plan.unplacedPanels).toEqual([]);
    expect(plan.sheetsUsed).toBeGreaterThanOrEqual(1);

    for (const sheet of plan.sheets) {
      const rectangles: Rect[] = [...sheet.panels, ...sheet.offcuts];
      rectangles.forEach(expectWithinStock);

      for (let i = 0; i < rectangles.length; i += 1) {
        for (let j = i + 1; j < rectangles.length; j += 1) {
          expect(overlaps(rectangles[i] as Rect, rectangles[j] as Rect)).toBe(false);
        }
      }

      const tiledArea = rectangles.reduce(
        (sum, rect) => sum + rect.length * rect.width,
        0,
      );
      expect(tiledArea).toBeCloseTo(STOCK_AREA, 6);

      const rows = new Map<number, PlacedPanel[]>();
      for (const placed of sheet.panels) {
        const key = Math.round(placed.y / EPS);
        const row = rows.get(key) ?? [];
        row.push(placed);
        rows.set(key, row);
      }

      for (const row of rows.values()) {
        const ordered = [...row].sort((a, b) => a.x - b.x);
        expect(first(ordered).x).toBeCloseTo(0, 6);
        for (let index = 1; index < ordered.length; index += 1) {
          const previous = ordered[index - 1] as PlacedPanel;
          const current = ordered[index] as PlacedPanel;
          expect(current.x).toBeCloseTo(previous.x + previous.length, 6);
        }
      }
    }
  });

  it('reports oversized panels explicitly instead of dropping them', () => {
    const plan = optimizePlywood([panel('ok', 1.2, 0.6), panel('big', 3.0, 1.5)], STOCK);

    expect(plan.sheetsUsed).toBe(1);
    expect(first(plan.sheets).panels.map((placed) => placed.panelId)).toEqual(['ok']);
    expect(plan.unplacedPanels).toHaveLength(1);
    expect(plan.oversizedPanels).toHaveLength(1);
    expect(first(plan.oversizedPanels)).toMatchObject({
      panelId: 'big',
      length: 3.0,
      width: 1.5,
      reason: 'oversized',
    });
  });

  it('reports an unsorted input-order baseline that sorted packing improves on', () => {
    const panels = [panel('narrow', 1.2, 0.7), panel('wide', 1.2, 0.8)];

    const plan = optimizePlywood(panels, STOCK);

    expect(plan.sheetsUsed).toBe(1);
    expect(plan.naiveSheets).toBe(2);
    expect(plan.naiveSheets - plan.sheetsUsed).toBeGreaterThanOrEqual(1);
  });

  it('excludes oversized panels from the unsorted baseline', () => {
    const panels = [panel('narrow', 1.2, 0.7), panel('wide', 1.2, 0.8), panel('big', 3, 1.5)];

    const plan = optimizePlywood(panels, STOCK);

    expect(plan.sheetsUsed).toBe(1);
    expect(plan.naiveSheets).toBe(2);
    expect(plan.oversizedPanels.map((entry) => entry.panelId)).toEqual(['big']);
  });

  it('returns an empty plan for empty requirements', () => {
    const plan = optimizePlywood([], STOCK);

    expect(plan.sheets).toEqual([]);
    expect(plan.sheetsUsed).toBe(0);
    expect(plan.usedArea).toBe(0);
    expect(plan.utilization).toBe(0);
    expect(plan.waste).toBe(0);
    expect(plan.unplacedPanels).toEqual([]);
    expect(plan.oversizedPanels).toEqual([]);
  });

  it('marks offcuts reusable only when both dimensions reach the threshold', () => {
    const large = first(optimizePlywood([panel('p', 2.14, 0.92)], STOCK).sheets);
    expect(large.offcuts).toHaveLength(2);
    expect(large.offcuts.every((offcut: Offcut) => offcut.reusable)).toBe(true);

    const largeOffcuts = large.offcuts.map((offcut) => ({
      length: offcut.length,
      width: offcut.width,
    }));
    expect(largeOffcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ length: expect.closeTo(0.3, 6) }),
        expect.objectContaining({ width: expect.closeTo(0.3, 6) }),
      ]),
    );

    const thin = first(optimizePlywood([panel('p', 2.439, 1.219)], STOCK).sheets);
    expect(thin.offcuts.every((offcut) => !offcut.reusable)).toBe(true);
  });

  it('exposes a 0.30m reuse threshold', () => {
    expect(MIN_REUSABLE_OFFCUT).toBe(0.3);
  });

  it('achieves over 80% utilization on a realistic formwork panel mix', () => {
    const panels = [
      ...Array.from({ length: 6 }, (_, index) => panel(`beam-side-${index}`, 2.4, 0.4)),
      ...Array.from({ length: 3 }, (_, index) => panel(`beam-bottom-${index}`, 2.4, 0.25)),
      ...Array.from({ length: 4 }, (_, index) => panel(`column-side-${index}`, 0.6, 2.0)),
    ];

    const plan = optimizePlywood(panels, STOCK);

    expect(plan.unplacedPanels).toEqual([]);
    expect(plan.sheetsUsed).toBe(5);
    expect(plan.utilization).toBeGreaterThan(80);
    expect(plan.utilization).toBeLessThan(100);
    const reusablePercent = (plan.reusableOffcutArea / plan.stockArea) * 100;
    expect(plan.utilization + plan.waste + reusablePercent).toBeCloseTo(100, 6);
  });
});
