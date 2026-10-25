import { describe, expect, it } from 'vitest';
import { daysInInventory, queryPieces } from './inventory';
import type { Piece } from './types';

function makePiece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'piece-1',
    projectId: 'project-1',
    materialType: 'lumber',
    length: 3,
    width: 0,
    thickness: 0,
    crossSection: '2x3',
    condition: 'Good',
    usageCount: 0,
    storageLocation: 'Rack A',
    dateAdded: '2026-01-01T00:00:00.000Z',
    retired: false,
    source: 'manual',
    ...overrides,
  };
}

function seedPieces(): { phenolic: Piece; lumber2x3: Piece; lumber2x4: Piece } {
  return {
    phenolic: makePiece({
      id: 'phenolic-1',
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      crossSection: undefined,
      storageLocation: 'Rack A',
      dateAdded: '2026-01-01T00:00:00.000Z',
    }),
    lumber2x3: makePiece({
      id: 'lumber-2x3',
      length: 3.0,
      crossSection: '2x3',
      storageLocation: 'Rack B',
      dateAdded: '2026-02-01T00:00:00.000Z',
    }),
    lumber2x4: makePiece({
      id: 'lumber-2x4',
      length: 4.8,
      crossSection: '2x4',
      usageCount: 3,
      storageLocation: 'Ground',
      dateAdded: '2026-03-01T00:00:00.000Z',
    }),
  };
}

describe('inventory search, filter, and sort', () => {
  it('searches by dimension, material type, cross-section, and storage location', () => {
    const { phenolic, lumber2x3, lumber2x4 } = seedPieces();
    const pieces = [phenolic, lumber2x3, lumber2x4];

    expect(queryPieces(pieces, { search: '2.44' }).map((piece) => piece.id)).toEqual([
      phenolic.id,
    ]);
    expect(
      queryPieces(pieces, { search: 'lumber' })
        .map((piece) => piece.id)
        .sort(),
    ).toEqual([lumber2x3.id, lumber2x4.id].sort());
    expect(queryPieces(pieces, { search: '2x3' }).map((piece) => piece.id)).toEqual([
      lumber2x3.id,
    ]);
    expect(queryPieces(pieces, { search: 'rack b' }).map((piece) => piece.id)).toEqual([
      lumber2x3.id,
    ]);
    expect(queryPieces(pieces, { search: 'PHENOLIC ground' })).toHaveLength(0);
  });

  it('filters by material type, condition, and inclusive usage range', () => {
    const { phenolic, lumber2x3, lumber2x4 } = seedPieces();
    const pieces = [phenolic, lumber2x3, lumber2x4];

    expect(queryPieces(pieces, { materialType: 'lumber' })).toHaveLength(2);
    expect(queryPieces(pieces, { condition: 'Good' })).toHaveLength(3);
    expect(queryPieces(pieces, { minUsage: 1 })).toHaveLength(1);
    expect(queryPieces(pieces, { minUsage: 3, maxUsage: 3 })).toHaveLength(1);
    expect(queryPieces(pieces, { minUsage: 4 })).toHaveLength(0);
  });

  it('sorts by any column in either direction', () => {
    const { phenolic, lumber2x3, lumber2x4 } = seedPieces();
    const pieces = [phenolic, lumber2x3, lumber2x4];

    expect(
      queryPieces(pieces, { sortKey: 'usageCount', sortDirection: 'asc' }).map(
        (piece) => piece.usageCount,
      ),
    ).toEqual([0, 0, 3]);
    expect(
      queryPieces(pieces, { sortKey: 'usageCount', sortDirection: 'desc' })[0]?.id,
    ).toBe(lumber2x4.id);
    expect(
      queryPieces(pieces, { sortKey: 'dimensions', sortDirection: 'asc' }).map(
        (piece) => piece.id,
      ),
    ).toEqual([phenolic.id, lumber2x3.id, lumber2x4.id]);
    expect(
      queryPieces(pieces, { sortKey: 'storageLocation', sortDirection: 'asc' }).map(
        (piece) => piece.storageLocation,
      ),
    ).toEqual(['Ground', 'Rack A', 'Rack B']);
    expect(
      queryPieces(pieces, { sortKey: 'dateAdded', sortDirection: 'desc' })[0]?.id,
    ).toBe(lumber2x4.id);
  });
});

describe('days in inventory', () => {
  it('counts whole days since the piece was added and never returns a negative value', () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    expect(daysInInventory('2026-03-01T00:00:00.000Z', now)).toBe(9);
    expect(daysInInventory('2026-03-10T00:00:00.000Z', now)).toBe(0);
    expect(daysInInventory('2026-03-11T00:00:00.000Z', now)).toBe(0);
  });
});
