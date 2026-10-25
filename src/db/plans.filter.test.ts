import { describe, expect, it } from 'vitest';
import { filterCuttingPlanSnapshot } from './plans';
import type { CuttingPlanSnapshot } from './plans';

function snapshot(overrides: Partial<CuttingPlanSnapshot> = {}): CuttingPlanSnapshot {
  return {
    satisfiedRequirementIds: ['req-1'],
    acceptedByRequirement: { 'req-1': 'piece-1' },
    ...overrides,
  };
}

describe('filterCuttingPlanSnapshot', () => {
  it('filters stale requirement ids out of a restored snapshot', () => {
    const filtered = filterCuttingPlanSnapshot(
      snapshot({
        satisfiedRequirementIds: ['req-1', 'removed'],
        acceptedByRequirement: { 'req-1': 'piece-1', removed: 'piece-9' },
      }),
      new Set(['req-1', 'req-2']),
    );

    expect(filtered).toEqual({
      satisfiedRequirementIds: ['req-1'],
      acceptedByRequirement: { 'req-1': 'piece-1' },
    });
  });
});
