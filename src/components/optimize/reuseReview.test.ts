import { describe, expect, it } from 'vitest';
import {
  countReviews,
  decidedCount,
  groupReviewsByMember,
  reviewRequirements,
} from './reuseReview';
import type { InventoryMatch, MatchGroup, MatchPiece } from '@/engine/types';

function piece(id: string, overrides: Partial<MatchPiece> = {}): MatchPiece {
  return {
    id,
    materialType: 'lumber',
    length: 3,
    width: 0,
    crossSection: '2x3',
    condition: 'Good',
    retired: false,
    usageCount: 0,
    ...overrides,
  };
}

function candidate(pieceId: string, overrides: Partial<MatchPiece> = {}): InventoryMatch {
  return {
    pieceId,
    piece: piece(pieceId, overrides),
    requiresCutting: true,
    surplusArea: 0.6,
    surplusMaxDimension: 0.6,
  };
}

function group(
  id: string,
  candidates: InventoryMatch[],
  overrides: Partial<MatchGroup['requirement']> = {},
): MatchGroup {
  return {
    requirement: {
      id,
      materialType: 'lumber',
      label: id,
      length: 2.4,
      crossSection: '2x3',
      ...overrides,
    },
    candidates,
    bestMatch: candidates[0] ?? null,
  };
}

describe('reviewRequirements', () => {
  it('classifies requirements by their reuse status', () => {
    const groups = [
      group('accepted', [candidate('p1')]),
      group('new-stock', [candidate('p2')]),
      group('declined', [candidate('p3')]),
      group('no-match', []),
      group('open', [candidate('p4')]),
    ];

    const reviews = reviewRequirements(
      groups,
      new Set(['accepted']),
      new Map([
        ['accepted', 'p1'],
        ['other', 'p2'],
      ]),
      new Set(['declined::p3']),
    );

    expect(reviews.map((review) => review.status)).toEqual([
      'satisfied',
      'newStock',
      'noMatch',
      'newStock',
      'needsDecision',
    ]);
    expect(reviews[0]!.acceptedPieceId).toBe('p1');
  });

  it('classifies requirements without available candidates as new stock', () => {
    const groups = [
      group('no-candidates', []),
      group('assigned', [candidate('p1')]),
      group('declined', [candidate('p2')]),
      group('mixed', [candidate('p3'), candidate('p4')]),
    ];

    const reviews = reviewRequirements(
      groups,
      new Set(),
      new Map([['other', 'p1']]),
      new Set(['declined::p2']),
    );

    expect(reviews.map((review) => review.status)).toEqual([
      'newStock',
      'newStock',
      'noMatch',
      'needsDecision',
    ]);
  });

  it('hides candidates assigned to other requirements and counts them', () => {
    const groups = [group('brace', [candidate('p1'), candidate('p2')])];

    const [review] = reviewRequirements(
      groups,
      new Set(),
      new Map([['other', 'p1']]),
      new Set(),
    );

    expect(review!.availableCandidates.map((item) => item.pieceId)).toEqual(['p2']);
    expect(review!.assignedElsewhereCount).toBe(1);
    expect(review!.status).toBe('needsDecision');
  });

  it('counts decided requirements', () => {
    const groups = [
      group('a', [candidate('p1')]),
      group('b', []),
      group('c', [candidate('p3')]),
    ];
    const reviews = reviewRequirements(
      groups,
      new Set(['a']),
      new Map([['a', 'p1']]),
      new Set(),
    );

    expect(countReviews(reviews)).toEqual({
      needsDecision: 1,
      satisfied: 1,
      newStock: 1,
      noMatch: 0,
    });
    expect(decidedCount(reviews)).toBe(2);
  });

  it('groups panels by member and lumber under one section', () => {
    const reviews = reviewRequirements(
      [
        group('c1', [], { materialType: 'phenolic', label: 'C1', memberId: 'm1' }),
        group('c2', [], { materialType: 'phenolic', label: 'C1', memberId: 'm1' }),
        group('brace', [], { label: 'Brace A' }),
      ],
      new Set(),
      new Map(),
      new Set(),
    );
    const sections = groupReviewsByMember(
      reviews,
      new Map([['C1', '#93c5fd']]),
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ title: 'C1', color: '#93c5fd' });
    expect(sections[0]!.reviews).toHaveLength(2);
    expect(sections[1]).toMatchObject({ title: 'Lumber requirements' });
    expect(sections[1]!.color).toBeUndefined();
  });
});
