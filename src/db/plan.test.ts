import { describe, expect, it } from 'vitest';
import {
  emptyProjectPlan,
  parseProjectPlan,
  PROJECT_PLAN_ID,
  type ProjectPlan,
} from './plan';

describe('project plan', () => {
  it('starts empty as a draft with no assignments, declines, locks, or invalidations', () => {
    expect(emptyProjectPlan()).toEqual({
      schemaVersion: 1,
      status: 'draft',
      acceptedByRequirement: {},
      committedByRequirement: {},
      declinedCandidates: [],
      exclusiveMemberIds: [],
      placements: {},
      requirementSnapshots: {},
      pieceSnapshots: {},
      usageRecordedPieceIds: [],
      invalidations: [],
      committedAt: null,
      updatedAt: '',
    });
  });

  it('parses missing or malformed data as an empty draft', () => {
    expect(parseProjectPlan(null)).toEqual(emptyProjectPlan());
    expect(
      parseProjectPlan({
        status: 'not-a-status',
        acceptedByRequirement: { valid: 'piece-1', invalid: 42 },
        committedByRequirement: 'nope',
        declinedCandidates: ['valid', 42],
      }),
    ).toMatchObject({
      status: 'draft',
      acceptedByRequirement: { valid: 'piece-1' },
      committedByRequirement: {},
      declinedCandidates: [],
    });
  });

  it('round-trips a populated plan and preserves every record', () => {
    const populated: ProjectPlan = {
      ...emptyProjectPlan(),
      status: 'committed',
      acceptedByRequirement: { 'A-panel-1': 'piece-1', 'B-panel-1': 'piece-1' },
      committedByRequirement: { 'A-panel-1': 'piece-1', 'B-panel-1': 'piece-1' },
      declinedCandidates: ['A-panel-1::piece-2'],
      exclusiveMemberIds: ['member-a'],
      placements: {
        'A-panel-1': {
          pieceId: 'piece-1',
          x: 0,
          y: 0,
          length: 1,
          width: 0.5,
          rotated: false,
        },
      },
      requirementSnapshots: {
        'A-panel-1': { length: 1, width: 0.5 },
        'lumber-1': { length: 2, crossSection: '2x4' },
      },
      pieceSnapshots: {
        'piece-1': {
          length: 2,
          width: 1,
          materialType: 'phenolic',
          retired: false,
        },
      },
      usageRecordedPieceIds: ['piece-1'],
      invalidations: [
        {
          id: 'invalidation-1',
          message: 'A panel dimensions changed; allocation released.',
          requirementIds: ['A-panel-1'],
          pieceIds: ['piece-1'],
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      committedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    };

    expect(parseProjectPlan(JSON.parse(JSON.stringify(populated)))).toEqual(populated);
  });

  it('reads the planner document rather than the legacy optimization workflow', () => {
    expect(PROJECT_PLAN_ID).toBe('planner');
  });
});
