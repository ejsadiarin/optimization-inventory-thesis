import { describe, expect, it } from 'vitest';
import { matchInventory, remainingRequirements } from './match';
import type { MatchPiece, MatchRequirement } from './types';

function requirement(overrides: Partial<MatchRequirement> = {}): MatchRequirement {
  return {
    id: 'req-1',
    materialType: 'phenolic',
    label: 'C1',
    length: 1,
    width: 0.5,
    ...overrides,
  };
}

function piece(overrides: Partial<MatchPiece> = {}): MatchPiece {
  return {
    id: 'piece-1',
    materialType: 'phenolic',
    length: 1,
    width: 0.5,
    condition: 'Good',
    retired: false,
    ...overrides,
  };
}

describe('matchInventory filtering', () => {
  it('excludes retired pieces from candidates', () => {
    const groups = matchInventory(
      [requirement()],
      [
        piece({ id: 'retired-flag', retired: true }),
        piece({ id: 'retired-condition', condition: 'Retired' }),
        piece({ id: 'active' }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['active']);
  });

  it('keeps pieces flagged For Inspection available for reuse', () => {
    const groups = matchInventory(
      [requirement()],
      [piece({ id: 'inspection', condition: 'For Inspection' })],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['inspection']);
  });

  it('matches only pieces of the requirement material type', () => {
    const phenolicGroups = matchInventory(
      [requirement()],
      [
        piece({ id: 'plywood' }),
        piece({ id: 'lumber', materialType: 'lumber', length: 3, width: 0, crossSection: '2x3' }),
      ],
    );
    const lumberGroups = matchInventory(
      [requirement({ id: 'req-lumber', materialType: 'lumber', length: 2.4, width: undefined, crossSection: '2x3' })],
      [
        piece({ id: 'plywood' }),
        piece({ id: 'lumber', materialType: 'lumber', length: 3, width: 0, crossSection: '2x3' }),
      ],
    );

    expect(phenolicGroups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['plywood']);
    expect(lumberGroups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['lumber']);
  });

  it('requires an exact cross-section and sufficient length for lumber', () => {
    const groups = matchInventory(
      [
        requirement({
          id: 'req-lumber',
          materialType: 'lumber',
          length: 2.4,
          width: undefined,
          crossSection: '2x3',
        }),
      ],
      [
        piece({ id: 'long-enough', materialType: 'lumber', length: 3, width: 0, crossSection: '2x3' }),
        piece({ id: 'wrong-section', materialType: 'lumber', length: 3, width: 0, crossSection: '2x4' }),
        piece({ id: 'too-short', materialType: 'lumber', length: 2.3, width: 0, crossSection: '2x3' }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['long-enough']);
  });

  it('requires both phenolic dimensions to be at least the requirement, in either orientation', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 0.5 })],
      [
        piece({ id: 'upright', length: 1, width: 0.5 }),
        piece({ id: 'rotated', length: 0.5, width: 1 }),
        piece({ id: 'too-narrow', length: 2, width: 0.4 }),
        piece({ id: 'too-short', length: 0.4, width: 0.9 }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['rotated', 'upright']);
  });
});

describe('matchInventory ranking', () => {
  it('ranks candidates smallest-fit-first by area surplus', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 0.5 })],
      [
        piece({ id: 'large', length: 1, width: 1 }),
        piece({ id: 'closest', length: 1.1, width: 0.55 }),
        piece({ id: 'medium', length: 0.6, width: 1.5 }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual([
      'closest',
      'medium',
      'large',
    ]);
  });

  it('breaks equal area surplus with the smaller maximum dimension surplus', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 2 })],
      [
        piece({ id: 'tall', length: 1, width: 4 }),
        piece({ id: 'square', length: 2, width: 2 }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual(['square', 'tall']);
  });

  it('exposes the best match as the first candidate', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 0.5 })],
      [
        piece({ id: 'large', length: 1.5, width: 1 }),
        piece({ id: 'exact', length: 1, width: 0.5 }),
      ],
    );

    expect(groups[0]!.bestMatch?.pieceId).toBe('exact');
  });
});

describe('matchInventory cutting flags', () => {
  it('does not flag exact phenolic fits, including rotated exact fits', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 0.5 })],
      [piece({ id: 'exact', length: 1, width: 0.5 }), piece({ id: 'rotated', length: 0.5, width: 1 })],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.requiresCutting)).toEqual([false, false]);
  });

  it('flags phenolic pieces oversized in either dimension', () => {
    const groups = matchInventory(
      [requirement({ length: 1, width: 0.5 })],
      [
        piece({ id: 'longer', length: 1.2, width: 0.5 }),
        piece({ id: 'wider', length: 1, width: 0.6 }),
        piece({ id: 'both', length: 1.2, width: 0.6 }),
      ],
    );

    expect(groups[0]!.candidates.map((candidate) => candidate.pieceId)).toEqual([
      'wider',
      'longer',
      'both',
    ]);
    expect(groups[0]!.candidates.map((candidate) => candidate.requiresCutting)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('flags only lumber pieces longer than required', () => {
    const groups = matchInventory(
      [
        requirement({
          id: 'req-lumber',
          materialType: 'lumber',
          length: 2.4,
          width: undefined,
          crossSection: '2x3',
        }),
      ],
      [
        piece({ id: 'exact', materialType: 'lumber', length: 2.4, width: 0, crossSection: '2x3' }),
        piece({ id: 'longer', materialType: 'lumber', length: 3, width: 0, crossSection: '2x3' }),
      ],
    );

    expect(
      groups[0]!.candidates.map((candidate) => [candidate.pieceId, candidate.requiresCutting]),
    ).toEqual([
      ['exact', false],
      ['longer', true],
    ]);
  });
});

describe('matchInventory groups', () => {
  it('returns one group per requirement, including requirements with no candidates', () => {
    const groups = matchInventory(
      [requirement({ id: 'req-a' }), requirement({ id: 'req-b', length: 5, width: 5 })],
      [piece()],
    );

    expect(groups.map((group) => group.requirement.id)).toEqual(['req-a', 'req-b']);
    expect(groups[1]!.candidates).toEqual([]);
    expect(groups[1]!.bestMatch).toBeNull();
  });

  it('lists requirements still awaiting an accepted match', () => {
    const groups = matchInventory(
      [requirement({ id: 'req-a' }), requirement({ id: 'req-b' })],
      [piece()],
    );

    expect(remainingRequirements(groups, new Set(['req-a'])).map((item) => item.id)).toEqual([
      'req-b',
    ]);
  });
});
