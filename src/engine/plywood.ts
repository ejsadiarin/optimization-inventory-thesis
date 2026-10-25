import type {
  Offcut,
  PlacedPanel,
  PlywoodPanel,
  PlywoodPlan,
  PlywoodSheetPlan,
  StockSize,
  UnplacedPanel,
  UnplacedReason,
} from './types';

export const MIN_REUSABLE_OFFCUT = 0.3;

const EPS = 1e-9;

interface Orientation {
  length: number;
  width: number;
  rotated: boolean;
}

interface ShelfState {
  y: number;
  height: number;
  usedLength: number;
  panels: PlacedPanel[];
}

interface SheetState {
  index: number;
  shelves: ShelfState[];
}

interface WorkItem {
  panel: PlywoodPanel;
  orientations: Orientation[];
  preferred: Orientation;
}

interface PackingResult {
  sheets: SheetState[];
  unplacedPanels: UnplacedPanel[];
  oversizedPanels: UnplacedPanel[];
}

function orientationsFor(panel: PlywoodPanel, stock: StockSize): Orientation[] {
  const candidates: Orientation[] = [
    { length: panel.length, width: panel.width, rotated: false },
    { length: panel.width, width: panel.length, rotated: true },
  ];

  return candidates.filter(
    (orientation) =>
      orientation.length <= stock.length + EPS && orientation.width <= stock.width + EPS,
  );
}

function preferredOrientation(orientations: Orientation[]): Orientation {
  const [first, ...rest] = orientations;
  if (!first) throw new Error('preferredOrientation requires at least one orientation');

  return rest.reduce((best, orientation) => {
    if (orientation.width < best.width - EPS) return orientation;
    if (Math.abs(orientation.width - best.width) <= EPS && orientation.length > best.length + EPS) {
      return orientation;
    }
    return best;
  }, first);
}

function toUnplaced(panel: PlywoodPanel, reason: UnplacedReason): UnplacedPanel {
  return {
    panelId: panel.id,
    label: panel.label ?? panel.id,
    length: panel.length,
    width: panel.width,
    reason,
  };
}

function placePanel(
  panel: PlywoodPanel,
  orientation: Orientation,
  x: number,
  y: number,
): PlacedPanel {
  return {
    panelId: panel.id,
    label: panel.label ?? panel.id,
    x,
    y,
    length: orientation.length,
    width: orientation.width,
    rotated: orientation.rotated,
  };
}

function shelfBottom(sheet: SheetState): number {
  return sheet.shelves.reduce((bottom, shelf) => bottom + shelf.height, 0);
}

function addShelf(sheet: SheetState, orientation: Orientation, panel: PlywoodPanel): void {
  const y = shelfBottom(sheet);
  sheet.shelves.push({
    y,
    height: orientation.width,
    usedLength: orientation.length,
    panels: [placePanel(panel, orientation, 0, y)],
  });
}

function buildSheetPlan(sheet: SheetState, stock: StockSize): PlywoodSheetPlan {
  const stockArea = stock.length * stock.width;
  const offcuts: Offcut[] = [];
  let usedArea = 0;

  function addOffcut(x: number, y: number, length: number, width: number): void {
    const reusable =
      length + EPS >= MIN_REUSABLE_OFFCUT && width + EPS >= MIN_REUSABLE_OFFCUT;
    offcuts.push({ x, y, length, width, reusable });
  }

  for (const shelf of sheet.shelves) {
    usedArea += shelf.panels.reduce((area, panel) => area + panel.length * panel.width, 0);

    const remainingLength = stock.length - shelf.usedLength;
    if (remainingLength > EPS) {
      addOffcut(shelf.usedLength, shelf.y, remainingLength, shelf.height);
    }

    for (const panel of shelf.panels) {
      const gap = shelf.height - panel.width;
      if (gap > EPS) {
        addOffcut(panel.x, panel.y + panel.width, panel.length, gap);
      }
    }
  }

  const usedHeight = shelfBottom(sheet);
  const remainingHeight = stock.width - usedHeight;
  if (remainingHeight > EPS) {
    addOffcut(0, usedHeight, stock.length, remainingHeight);
  }

  const offcutArea = offcuts.reduce((area, offcut) => area + offcut.length * offcut.width, 0);
  const reusableOffcutArea = offcuts
    .filter((offcut) => offcut.reusable)
    .reduce((area, offcut) => area + offcut.length * offcut.width, 0);
  const wasteArea = Math.max(0, offcutArea - reusableOffcutArea);

  return {
    sheetIndex: sheet.index,
    stock,
    panels: sheet.shelves.flatMap((shelf) => shelf.panels),
    offcuts,
    usedArea,
    offcutArea,
    reusableOffcutArea,
    wasteArea,
    utilization: stockArea > 0 ? (usedArea / stockArea) * 100 : 0,
    waste: stockArea > 0 ? (wasteArea / stockArea) * 100 : 0,
  };
}

function packSheets(
  panels: readonly PlywoodPanel[],
  stockSize: StockSize,
  sortWork: boolean,
): PackingResult {
  const sheets: SheetState[] = [];
  const unplacedPanels: UnplacedPanel[] = [];
  const oversizedPanels: UnplacedPanel[] = [];
  const work: WorkItem[] = [];

  for (const panel of panels) {
    const orientations = orientationsFor(panel, stockSize);
    if (orientations.length === 0) {
      const unplaced = toUnplaced(panel, 'oversized');
      unplacedPanels.push(unplaced);
      oversizedPanels.push(unplaced);
      continue;
    }

    work.push({ panel, orientations, preferred: preferredOrientation(orientations) });
  }

  if (sortWork) {
    work.sort((a, b) => {
      if (Math.abs(a.preferred.width - b.preferred.width) > EPS) {
        return b.preferred.width - a.preferred.width;
      }
      if (Math.abs(a.preferred.length - b.preferred.length) > EPS) {
        return b.preferred.length - a.preferred.length;
      }
      return a.panel.id < b.panel.id ? -1 : a.panel.id > b.panel.id ? 1 : 0;
    });
  }

  for (const item of work) {
    const ordered = [
      item.preferred,
      ...item.orientations.filter((orientation) => orientation !== item.preferred),
    ];
    let placed = false;

    for (const sheet of sheets) {
      for (const shelf of sheet.shelves) {
        const orientation = ordered.find(
          (candidate) =>
            candidate.width <= shelf.height + EPS &&
            candidate.length <= stockSize.length - shelf.usedLength + EPS,
        );

        if (orientation) {
          shelf.panels.push(placePanel(item.panel, orientation, shelf.usedLength, shelf.y));
          shelf.usedLength += orientation.length;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (placed) continue;

    const openable = sheets.find(
      (sheet) => shelfBottom(sheet) + item.preferred.width <= stockSize.width + EPS,
    );

    if (openable) {
      addShelf(openable, item.preferred, item.panel);
      continue;
    }

    const sheet: SheetState = { index: sheets.length, shelves: [] };
    sheets.push(sheet);
    addShelf(sheet, item.preferred, item.panel);
  }

  return { sheets, unplacedPanels, oversizedPanels };
}

export function optimizePlywood(
  panels: readonly PlywoodPanel[],
  stockSize: StockSize,
): PlywoodPlan {
  const packed = packSheets(panels, stockSize, true);
  const naiveSheets = packSheets(panels, stockSize, false).sheets.length;
  const { sheets, unplacedPanels, oversizedPanels } = packed;

  const sheetPlans = sheets.map((sheet) => buildSheetPlan(sheet, stockSize));
  const usedArea = sheetPlans.reduce((area, sheet) => area + sheet.usedArea, 0);
  const stockArea = sheetPlans.reduce((area, sheet) => area + sheet.stock.length * sheet.stock.width, 0);
  const offcutArea = sheetPlans.reduce((area, sheet) => area + sheet.offcutArea, 0);
  const reusableOffcutArea = sheetPlans.reduce(
    (area, sheet) => area + sheet.reusableOffcutArea,
    0,
  );
  const wasteArea = sheetPlans.reduce((area, sheet) => area + sheet.wasteArea, 0);

  return {
    stock: stockSize,
    sheets: sheetPlans,
    sheetsUsed: sheetPlans.length,
    naiveSheets,
    unplacedPanels,
    oversizedPanels,
    usedArea,
    stockArea,
    offcutArea,
    reusableOffcutArea,
    wasteArea,
    utilization: stockArea > 0 ? (usedArea / stockArea) * 100 : 0,
    waste: stockArea > 0 ? (wasteArea / stockArea) * 100 : 0,
  };
}
