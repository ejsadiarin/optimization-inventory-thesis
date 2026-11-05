import { describe, expect, it } from 'vitest';
import {
  buildNavAnnotations,
  type ProjectProgressCounts,
} from './projectProgress';

function counts(overrides: Partial<ProjectProgressCounts> = {}): ProjectProgressCounts {
  return {
    structuralMembers: 0,
    lumberRequirements: 0,
    pieces: 0,
    requirements: 0,
    decidedRequirements: 0,
    ...overrides,
  };
}

describe('project progress', () => {
  it('starts a new project with no annotations', () => {
    expect(buildNavAnnotations(counts())).toEqual({});
  });

  it('marks members and inventory complete once populated', () => {
    const annotations = buildNavAnnotations(
      counts({ structuralMembers: 2, pieces: 3, requirements: 5, decidedRequirements: 2 }),
    );

    expect(annotations.members).toEqual({ complete: true });
    expect(annotations.inventory).toEqual({ complete: true });
    expect(annotations.planner).toEqual({ count: 3 });
  });

  it('counts undecided requirements from the draft plan', () => {
    const annotations = buildNavAnnotations(
      counts({ structuralMembers: 1, requirements: 4, decidedRequirements: 1 }),
    );

    expect(annotations.planner).toEqual({ count: 3 });
  });

  it('marks the planner complete when no decisions remain', () => {
    const annotations = buildNavAnnotations(
      counts({ structuralMembers: 1, requirements: 4, decidedRequirements: 4 }),
    );

    expect(annotations.planner).toEqual({ complete: true });
  });
});
