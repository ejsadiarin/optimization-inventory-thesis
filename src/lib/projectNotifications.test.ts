import { describe, expect, it } from 'vitest';
import { buildProjectNotifications } from './projectNotifications';

describe('buildProjectNotifications', () => {
  it('returns nothing when every requirement fits', () => {
    expect(buildProjectNotifications([], [])).toEqual([]);
  });

  it('describes oversized panels with their dimensions', () => {
    const [notification] = buildProjectNotifications(
      [
        {
          panelId: 'panel-1',
          label: 'S1',
          length: 5,
          width: 3,
          reason: 'oversized',
        },
      ],
      [],
    );

    expect(notification!).toMatchObject({
      id: 'oversized-panels',
      title: '1 panel exceeds the stock sheet',
      href: 'optimize?step=cuts',
    });
    expect(notification!.items).toEqual(['S1 (5.00 m × 3.00 m)']);
  });

  it('describes multiple oversized panels', () => {
    const [notification] = buildProjectNotifications(
      [
        { panelId: 'a', label: 'S1', length: 5, width: 3, reason: 'oversized' },
        { panelId: 'b', label: 'S2', length: 4, width: 2, reason: 'oversized' },
      ],
      [],
    );

    expect(notification!.title).toBe('2 panels exceed the stock sheet');
    expect(notification!.items).toHaveLength(2);
  });

  it('describes oversized lumber with its cross-section', () => {
    const [notification] = buildProjectNotifications(
      [],
      [
        {
          requirementId: 'lumber-1',
          label: 'Brace A',
          length: 4,
          crossSection: '2x3',
          reason: 'oversized',
        },
      ],
    );

    expect(notification!).toMatchObject({
      id: 'oversized-lumber',
      title: '1 lumber requirement exceeds the stock lengths',
      href: 'optimize?step=cuts',
    });
    expect(notification!.items).toEqual(['Brace A (4.00 m · 2×3)']);
  });
});
