import type { MemberInput, PanelRequirement, StockSize } from './types';

const FIT_TOLERANCE = 1e-9;

function fitsOrientation(
  length: number,
  width: number,
  stockLength: number,
  stockWidth: number,
): boolean {
  return length <= stockLength + FIT_TOLERANCE && width <= stockWidth + FIT_TOLERANCE;
}

function panelsFor(member: MemberInput): Array<{ length: number; width: number }> {
  const { length, width, height } = member;

  switch (member.type) {
    case 'column':
      return [
        { length, width: height },
        { length, width: height },
        { length: width, width: height },
        { length: width, width: height },
      ];
    case 'beam':
      return [
        { length, width },
        { length, width: height },
        { length, width: height },
      ];
    case 'slab':
      return [{ length, width }];
  }
}

export function decomposeMember(member: MemberInput): PanelRequirement[] {
  const memberKey = member.id ?? member.label;
  const panels = panelsFor(member);

  return panels.map((panel, index) => ({
    id: `${memberKey}-panel-${index + 1}`,
    memberId: member.id ?? '',
    label: member.label,
    memberType: member.type,
    materialType: 'phenolic',
    length: panel.length,
    width: panel.width,
    quantity: 1,
    exceedsStock: false,
    panelIndex: index + 1,
    panelCount: panels.length,
  }));
}

export function isPanelOversized(
  panel: Pick<PanelRequirement, 'length' | 'width'>,
  stockSize: StockSize,
): boolean {
  const upright = fitsOrientation(
    panel.length,
    panel.width,
    stockSize.length,
    stockSize.width,
  );
  const rotated = fitsOrientation(
    panel.length,
    panel.width,
    stockSize.width,
    stockSize.length,
  );

  return !upright && !rotated;
}

export function panelsExceedingStock<T extends Pick<PanelRequirement, 'length' | 'width'>>(
  panels: T[],
  stockSize: StockSize,
): T[] {
  return panels.filter((panel) => isPanelOversized(panel, stockSize));
}
