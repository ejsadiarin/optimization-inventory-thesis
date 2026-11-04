import { describe, expect, it } from 'vitest';
import { maxPanelAssignments } from './panelAssignments';

describe('maxPanelAssignments', () => {
  it('assigns one distinct piece per panel', () => {
    const assignments = maxPanelAssignments(
      ['p1', 'p2'],
      new Map([
        ['p1', ['a', 'b']],
        ['p2', ['b', 'c']],
      ]),
    );

    expect(assignments).toEqual({ p1: 'a', p2: 'b' });
  });

  it('does not let a greedy choice block a later panel', () => {
    const assignments = maxPanelAssignments(
      ['p1', 'p2'],
      new Map([
        ['p1', ['a', 'b']],
        ['p2', ['a']],
      ]),
    );

    expect(assignments).toEqual({ p1: 'b', p2: 'a' });
  });

  it('stops at the number of distinct pieces available', () => {
    const assignments = maxPanelAssignments(
      ['p1', 'p2', 'p3'],
      new Map([
        ['p1', ['a', 'b']],
        ['p2', ['a', 'b']],
        ['p3', ['a', 'b']],
      ]),
    );

    expect(Object.keys(assignments)).toHaveLength(2);
  });

  it('returns no assignments when nothing fits', () => {
    expect(
      maxPanelAssignments(
        ['p1', 'p2'],
        new Map([
          ['p1', []],
          ['p2', []],
        ]),
      ),
    ).toEqual({});
  });
});
