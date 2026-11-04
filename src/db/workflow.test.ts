import { describe, expect, it } from 'vitest';
import {
  clearWorkflowDecisions,
  declinedKey,
  emptyWorkflow,
  invalidateWorkflow,
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
    const current = workflow({ declinedCandidates: [] });

    expect(invalidateWorkflow(current, [requirement], [piece])).toBe(current);
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
