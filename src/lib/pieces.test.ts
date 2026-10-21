import { describe, expect, it } from 'vitest';
import type { Piece } from '@/db/types';
import { normalizePieceDimensions, toMatchPiece } from './pieces';

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'piece-1',
    projectId: 'project-1',
    materialType: 'phenolic',
    length: 1.2,
    width: 0.6,
    thickness: 0.018,
    condition: 'Good',
    usageCount: 2,
    storageLocation: 'Rack A',
    dateAdded: '2026-01-01T00:00:00.000Z',
    retired: false,
    source: 'manual',
    ...overrides,
  };
}

describe('toMatchPiece', () => {
  it('projects the fields the matching engine needs', () => {
    expect(toMatchPiece(piece())).toEqual({
      id: 'piece-1',
      materialType: 'phenolic',
      length: 1.2,
      width: 0.6,
      crossSection: undefined,
      condition: 'Good',
      retired: false,
      usageCount: 2,
    });
  });
});

describe('normalizePieceDimensions', () => {
  it('keeps width and thickness for phenolic pieces and drops the cross-section', () => {
    expect(
      normalizePieceDimensions({
        materialType: 'phenolic',
        width: 1.2,
        thickness: 0.018,
        crossSection: '2x3',
      }),
    ).toEqual({ width: 1.2, thickness: 0.018, crossSection: undefined });
  });

  it('zeroes width and thickness for lumber and keeps the cross-section', () => {
    expect(
      normalizePieceDimensions({
        materialType: 'lumber',
        width: 1.2,
        thickness: 0.018,
        crossSection: '2x3',
      }),
    ).toEqual({ width: 0, thickness: 0, crossSection: '2x3' });
  });
});
