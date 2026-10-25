import { describe, expect, it } from 'vitest';
import { MEMBER_COLORS, buildMemberColorMap } from './memberColors';

describe('buildMemberColorMap', () => {
  it('assigns a distinct color to each structural member', () => {
    const colors = buildMemberColorMap(['C1', 'B1', 'S1']);

    expect(colors.size).toBe(3);
    expect(new Set(colors.values()).size).toBe(3);
    for (const color of colors.values()) {
      expect(MEMBER_COLORS).toContain(color);
    }
  });

  it('is deterministic regardless of input order', () => {
    const forward = buildMemberColorMap(['C1', 'B1', 'S1']);
    const reversed = buildMemberColorMap(['S1', 'C1', 'B1']);

    expect([...forward.entries()]).toEqual([...reversed.entries()]);
  });

  it('ignores duplicate labels', () => {
    const colors = buildMemberColorMap(['C1', 'C1', 'B1']);

    expect(colors.size).toBe(2);
    expect([...colors.keys()]).toEqual(['B1', 'C1']);
  });
});
