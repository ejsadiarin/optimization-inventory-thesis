import { describe, expect, it } from 'vitest';
import {
  buildNavAnnotations,
  buildProjectChecklist,
  getNextProjectAction,
  type ProjectProgressCounts,
} from './projectProgress';

function counts(overrides: Partial<ProjectProgressCounts> = {}): ProjectProgressCounts {
  return {
    structuralMembers: 0,
    lumberRequirements: 0,
    pieces: 0,
    requirements: 0,
    decidedRequirements: 0,
    reuseReviewed: false,
    cutPlansReviewedAt: null,
    ...overrides,
  };
}

describe('project progress', () => {
  it('starts a new project with the members step', () => {
    const empty = counts();

    expect(getNextProjectAction(empty)).toEqual({
      label: 'Start with members',
      path: 'members',
    });
    expect(buildProjectChecklist(empty).map((item) => item.complete)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(buildNavAnnotations(empty)).toEqual({});
  });

  it('marks required and optional steps independently', () => {
    const checklist = buildProjectChecklist(
      counts({
        structuralMembers: 2,
        lumberRequirements: 1,
        pieces: 3,
        requirements: 5,
        decidedRequirements: 2,
        reuseReviewed: true,
      }),
    );

    expect(checklist.map((item) => [item.id, item.complete, item.optional])).toEqual([
      ['members', true, false],
      ['lumber', true, true],
      ['inventory', true, true],
      ['reuse', false, false],
      ['cuts', false, false],
    ]);
    expect(getNextProjectAction(
      counts({
        structuralMembers: 2,
        lumberRequirements: 1,
        pieces: 3,
        requirements: 5,
        decidedRequirements: 2,
        reuseReviewed: true,
      }),
    )).toEqual({ label: 'Review reuse decisions', path: 'optimize?step=reuse' });
  });

  it('moves to cut plans once every requirement is decided', () => {
    const decided = counts({
      structuralMembers: 1,
      requirements: 4,
      decidedRequirements: 4,
      reuseReviewed: true,
    });

    expect(buildProjectChecklist(decided)[3]?.complete).toBe(true);
    expect(getNextProjectAction(decided)).toEqual({
      label: 'Review cut plans',
      path: 'optimize?step=cuts',
    });
  });

  it('completes the required steps when cut plans are reviewed', () => {
    const reviewed = counts({
      structuralMembers: 1,
      pieces: 2,
      requirements: 4,
      decidedRequirements: 4,
      reuseReviewed: true,
      cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
    });

    const checklist = buildProjectChecklist(reviewed);

    expect(checklist.filter((item) => !item.optional).every((item) => item.complete)).toBe(true);
    expect(getNextProjectAction(reviewed)).toBeNull();
  });

  it('annotates tabs with completion and outstanding work', () => {
    const annotations = buildNavAnnotations(
      counts({
        structuralMembers: 2,
        pieces: 3,
        requirements: 5,
        decidedRequirements: 2,
        reuseReviewed: true,
      }),
    );

    expect(annotations.members).toEqual({ complete: true });
    expect(annotations.inventory).toBeUndefined();
    expect(annotations.optimize).toEqual({ count: 3 });
  });

  it('keeps reuse pending until the step has been reviewed', () => {
    const unreviewed = counts({
      structuralMembers: 1,
      requirements: 2,
      decidedRequirements: 2,
    });

    expect(buildProjectChecklist(unreviewed)[3]?.complete).toBe(false);
    expect(buildNavAnnotations(unreviewed).optimize).toBeUndefined();
    expect(getNextProjectAction(unreviewed)).toEqual({
      label: 'Review reuse decisions',
      path: 'optimize?step=reuse',
    });
  });

  it('marks optimization complete when no decisions remain', () => {
    const annotations = buildNavAnnotations(
      counts({
        structuralMembers: 1,
        requirements: 4,
        decidedRequirements: 4,
        reuseReviewed: true,
        cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
      }),
    );

    expect(annotations.optimize).toEqual({ complete: true });
  });
});
