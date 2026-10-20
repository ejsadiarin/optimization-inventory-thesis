import { describe, expect, it } from 'vitest';
import { decomposeMember, isPanelOversized, panelsExceedingStock } from './decompose';
import type { MemberInput, PanelRequirement, StockSize } from './types';

const DEFAULT_STOCK: StockSize = { length: 2.44, width: 1.22 };

function member(overrides: Partial<MemberInput> = {}): MemberInput {
  return {
    id: 'member-1',
    type: 'column',
    label: 'C1',
    length: 0.4,
    width: 0.25,
    height: 3,
    ...overrides,
  };
}

function dimensions(panels: PanelRequirement[]) {
  return panels.map((panel) => ({ length: panel.length, width: panel.width }));
}

describe('decomposeMember', () => {
  it('decomposes a column into two length-side and two width-side panels', () => {
    const panels = decomposeMember(member());

    expect(panels).toHaveLength(4);
    expect(dimensions(panels)).toEqual([
      { length: 0.4, width: 3 },
      { length: 0.4, width: 3 },
      { length: 0.25, width: 3 },
      { length: 0.25, width: 3 },
    ]);
  });

  it('decomposes a beam into one bottom panel and two side panels', () => {
    const panels = decomposeMember(
      member({ id: 'member-2', type: 'beam', label: 'B1', length: 4, width: 0.25, height: 0.5 }),
    );

    expect(panels).toHaveLength(3);
    expect(dimensions(panels)).toEqual([
      { length: 4, width: 0.25 },
      { length: 4, width: 0.5 },
      { length: 4, width: 0.5 },
    ]);
  });

  it('decomposes a slab into a single bottom panel', () => {
    const panels = decomposeMember(
      member({ id: 'member-3', type: 'slab', label: 'S1', length: 4.2, width: 3.1, height: 0 }),
    );

    expect(panels).toHaveLength(1);
    expect(dimensions(panels)).toEqual([{ length: 4.2, width: 3.1 }]);
  });

  it('returns individually traceable panels with the member identity', () => {
    const panels = decomposeMember(member());

    expect(new Set(panels.map((panel) => panel.id)).size).toBe(panels.length);
    for (const panel of panels) {
      expect(panel).toMatchObject({
        memberId: 'member-1',
        label: 'C1',
        memberType: 'column',
        materialType: 'phenolic',
        quantity: 1,
      });
    }
  });

  it('keeps realistic decimal dimensions intact', () => {
    const panels = decomposeMember(
      member({ type: 'beam', length: 3.75, width: 0.2, height: 0.45 }),
    );

    expect(dimensions(panels)).toEqual([
      { length: 3.75, width: 0.2 },
      { length: 3.75, width: 0.45 },
      { length: 3.75, width: 0.45 },
    ]);
  });
});

describe('isPanelOversized', () => {
  it('accepts panels equal to or smaller than the stock in either orientation', () => {
    expect(isPanelOversized({ length: 2.44, width: 1.22 }, DEFAULT_STOCK)).toBe(false);
    expect(isPanelOversized({ length: 1.22, width: 2.44 }, DEFAULT_STOCK)).toBe(false);
    expect(isPanelOversized({ length: 0.61, width: 2.44 }, DEFAULT_STOCK)).toBe(false);
  });

  it('flags a panel larger than the stock in either direction', () => {
    expect(isPanelOversized({ length: 2.44, width: 1.23 }, DEFAULT_STOCK)).toBe(true);
    expect(isPanelOversized({ length: 2.45, width: 1.22 }, DEFAULT_STOCK)).toBe(true);
    expect(isPanelOversized({ length: 3, width: 2 }, DEFAULT_STOCK)).toBe(true);
  });

  it('honours a project-specific stock override', () => {
    const customStock: StockSize = { length: 3, width: 1.5 };

    expect(isPanelOversized({ length: 3, width: 1.5 }, customStock)).toBe(false);
    expect(isPanelOversized({ length: 3.1, width: 1.5 }, customStock)).toBe(true);
  });
});

describe('panelsExceedingStock', () => {
  it('returns only the panels that need manual tiling', () => {
    const panels: PanelRequirement[] = [
      {
        id: 'p1',
        memberId: 'm1',
        label: 'S1',
        memberType: 'slab',
        materialType: 'phenolic',
        length: 4,
        width: 3,
        quantity: 1,
        exceedsStock: false,
      },
      {
        id: 'p2',
        memberId: 'm2',
        label: 'S2',
        memberType: 'slab',
        materialType: 'phenolic',
        length: 2,
        width: 1,
        quantity: 1,
        exceedsStock: false,
      },
    ];

    expect(panelsExceedingStock(panels, DEFAULT_STOCK).map((panel) => panel.id)).toEqual(['p1']);
  });
});
