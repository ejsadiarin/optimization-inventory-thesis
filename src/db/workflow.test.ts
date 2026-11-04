import { describe, expect, it } from 'vitest';
import {
  clearWorkflowDecisions,
  declinedKey,
  emptyWorkflow,
  invalidateWorkflow,
  parseWorkflow,
  resetRequirementDecisions,
  restoreDeclinedCandidate,
  workflowFromSnapshot,
  type OptimizationWorkflow,
} from './workflow';
import type { MatchPiece, MatchRequirement } from '@/engine/types';

function workflow(overrides: Partial<OptimizationWorkflow> = {}): OptimizationWorkflow {
  return {
    ...emptyWorkflow(),
    satisfiedRequirementIds: ['req-1'],
    acceptedByRequirement: { 'req-1': 'piece-1' },
    declinedCandidates: ['req-1::piece-2', 'req-2::piece-2'],
    step: 'cuts',
    cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const requirement: MatchRequirement = {
  id: 'req-1',
  materialType: 'phenolic',
  label: 'S1',
  length: 0.6,
  width: 0.6,
};

const piece: MatchPiece = {
  id: 'piece-1',
  materialType: 'phenolic',
  length: 0.6,
  width: 0.6,
  condition: 'Good',
  retired: false,
  usageCount: 0,
};

describe('workflow state', () => {
  it('derives reuse decisions from a cutting-plan snapshot and starts on reuse', () => {
    expect(
      workflowFromSnapshot({
        satisfiedRequirementIds: ['req-1'],
        acceptedByRequirement: { 'req-1': 'piece-1' },
      }),
    ).toEqual({
      ...emptyWorkflow(),
      satisfiedRequirementIds: ['req-1'],
      acceptedByRequirement: { 'req-1': 'piece-1' },
    });
  });

  it('reset clears declines but keeps accepted matches', () => {
    const reset = clearWorkflowDecisions(workflow());

    expect(reset).toEqual({
      ...workflow(),
      declinedCandidates: [],
    });
    expect(reset.satisfiedRequirementIds).toEqual(['req-1']);
    expect(reset.acceptedByRequirement).toEqual({ 'req-1': 'piece-1' });
    expect(reset.step).toBe('cuts');
    expect(reset.cutPlansReviewedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('keeps a valid accepted match unchanged', () => {
    const current = workflow({
      declinedCandidates: [],
      placements: {
        'req-1': {
          pieceId: 'piece-1',
          x: 0,
          y: 0,
          length: 0.6,
          width: 0.6,
          rotated: false,
        },
      },
    });

    expect(invalidateWorkflow(current, [requirement], [piece])).toBe(current);
  });

  it('parses a v2 workflow as a v3 allocation document', () => {
    const parsed = parseWorkflow({
      ...workflow({ schemaVersion: 2 }),
      schemaVersion: 2,
    });

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.acceptedByRequirement).toEqual({ 'req-1': 'piece-1' });
    expect(parsed.satisfiedRequirementIds).toEqual(['req-1']);
    expect(parsed.placements).toEqual({});
  });

  it('round-trips v3 placements through the document parser', () => {
    const placements = {
      'req-1': {
        pieceId: 'piece-1',
        x: 0,
        y: 0,
        length: 0.6,
        width: 0.6,
        rotated: false,
      },
    };
    const current = workflow({ placements });

    expect(
      parseWorkflow(JSON.parse(JSON.stringify(current))).placements,
    ).toEqual(placements);
  });

  it('rebuilds placements for a v2 document once pieces are available', () => {
    const requirements: MatchRequirement[] = [
      { ...requirement, id: 'req-1', length: 2.2, width: 0.3 },
      { ...requirement, id: 'req-2', length: 2.2, width: 0.3 },
    ];
    const largePiece: MatchPiece = { ...piece, length: 2.44, width: 1.22 };
    const legacy = parseWorkflow({
      ...workflow({ schemaVersion: 2 }),
      schemaVersion: 2,
      satisfiedRequirementIds: ['req-1', 'req-2'],
      acceptedByRequirement: { 'req-1': 'piece-1', 'req-2': 'piece-1' },
    });

    const resolved = invalidateWorkflow(legacy, requirements, [largePiece]);

    expect(resolved.placements).toEqual({
      'req-1': expect.objectContaining({ pieceId: 'piece-1', rotated: false }),
      'req-2': expect.objectContaining({ pieceId: 'piece-1', rotated: false }),
    });
  });

  it('keeps several panels assigned to one piece when they nest', () => {
    const requirements: MatchRequirement[] = [
      { ...requirement, id: 'req-1', length: 2.2, width: 0.3 },
      { ...requirement, id: 'req-2', length: 2.2, width: 0.3 },
    ];
    const largePiece: MatchPiece = { ...piece, length: 2.44, width: 1.22 };
    const current = workflow({
      satisfiedRequirementIds: ['req-1', 'req-2'],
      acceptedByRequirement: { 'req-1': 'piece-1', 'req-2': 'piece-1' },
      declinedCandidates: [],
    });

    const resolved = invalidateWorkflow(current, requirements, [largePiece]);

    expect(resolved.acceptedByRequirement).toEqual(current.acceptedByRequirement);
    expect(resolved.satisfiedRequirementIds).toEqual(
      current.satisfiedRequirementIds,
    );
    expect(Object.keys(resolved.placements ?? {})).toEqual(['req-1', 'req-2']);
  });

  it('drops only the panels that no longer fit one shared piece', () => {
    const requirements: MatchRequirement[] = [
      { ...requirement, id: 'req-1', length: 2.2, width: 0.3 },
      { ...requirement, id: 'req-2', length: 2.2, width: 0.3 },
      { ...requirement, id: 'req-3', length: 2.2, width: 0.3 },
    ];
    const narrowPiece: MatchPiece = { ...piece, length: 2.44, width: 0.6 };
    const current = workflow({
      satisfiedRequirementIds: ['req-1', 'req-2', 'req-3'],
      acceptedByRequirement: {
        'req-1': 'piece-1',
        'req-2': 'piece-1',
        'req-3': 'piece-1',
      },
      declinedCandidates: ['req-1::piece-2'],
    });

    const resolved = invalidateWorkflow(current, requirements, [narrowPiece]);

    expect(resolved.acceptedByRequirement).toEqual({
      'req-1': 'piece-1',
      'req-2': 'piece-1',
    });
    expect(resolved.satisfiedRequirementIds).toEqual(['req-1', 'req-2']);
    expect(resolved.declinedCandidates).toEqual(['req-1::piece-2']);
    expect(Object.keys(resolved.placements ?? {})).toEqual(['req-1', 'req-2']);
  });

  it('releases every panel assigned to a retired piece', () => {
    const requirements: MatchRequirement[] = [
      { ...requirement, id: 'req-1', length: 2.2, width: 0.3 },
      { ...requirement, id: 'req-2', length: 2.2, width: 0.3 },
    ];
    const current = workflow({
      satisfiedRequirementIds: ['req-1', 'req-2'],
      acceptedByRequirement: { 'req-1': 'piece-1', 'req-2': 'piece-1' },
    });

    expect(
      invalidateWorkflow(current, requirements, [{ ...piece, retired: true }]),
    ).toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('clears an accepted match whose piece no longer fits', () => {
    const smaller: MatchPiece = { ...piece, length: 0.5 };

    expect(invalidateWorkflow(workflow(), [requirement], [smaller])).toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('clears an accepted match whose requirement no longer exists', () => {
    expect(invalidateWorkflow(workflow(), [], [piece])).toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('clears an accepted match whose piece is retired', () => {
    expect(
      invalidateWorkflow(workflow(), [requirement], [{ ...piece, retired: true }]),
    ).toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('builds a declined key from the requirement and piece', () => {
    expect(declinedKey('req-1', 'piece-2')).toBe('req-1::piece-2');
  });

  it('restores a single declined candidate', () => {
    const restored = restoreDeclinedCandidate(workflow(), 'req-1::piece-2');

    expect(restored.declinedCandidates).toEqual(['req-2::piece-2']);
    expect(restored.satisfiedRequirementIds).toEqual(['req-1']);
    expect(restoreDeclinedCandidate(restored, 'req-1::piece-2')).toBe(restored);
  });

  it('resets one requirement without touching other decisions', () => {
    const reset = resetRequirementDecisions(workflow(), 'req-2');

    expect(reset.declinedCandidates).toEqual(['req-1::piece-2']);
    expect(reset.satisfiedRequirementIds).toEqual(['req-1']);
    expect(reset.acceptedByRequirement).toEqual({ 'req-1': 'piece-1' });
    expect(resetRequirementDecisions(reset, 'req-2')).toBe(reset);
  });
});
