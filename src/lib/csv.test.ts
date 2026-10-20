import { describe, expect, it } from 'vitest';
import type { Piece } from '@/db/types';
import { piecesToCsv } from './csv';

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'piece-1',
    projectId: 'project-1',
    materialType: 'phenolic',
    length: 2.44,
    width: 1.22,
    thickness: 0.018,
    condition: 'Good',
    usageCount: 2,
    storageLocation: 'Rack A',
    dateAdded: '2026-01-02T03:04:05.000Z',
    retired: false,
    source: 'manual',
    ...overrides,
  };
}

describe('piecesToCsv', () => {
  it('writes a header row and every piece field in a stable order', () => {
    const csv = piecesToCsv([piece()]);

    expect(csv).toBe(
      [
        'id,projectId,materialType,length,width,thickness,crossSection,condition,usageCount,storageLocation,dateAdded,retired,source',
        'piece-1,project-1,phenolic,2.44,1.22,0.018,,Good,2,Rack A,2026-01-02T03:04:05.000Z,false,manual',
        '',
      ].join('\r\n'),
    );
  });

  it('includes lumber cross-sections and retired pieces', () => {
    const csv = piecesToCsv([
      piece({
        id: 'piece-2',
        materialType: 'lumber',
        length: 3,
        width: 0,
        thickness: 0,
        crossSection: '2x3',
        condition: 'Retired',
        retired: true,
      }),
    ]);

    expect(csv).toContain('piece-2,project-1,lumber,3,0,0,2x3,Retired,2,Rack A');
    expect(csv).toContain(',2026-01-02T03:04:05.000Z,true,manual');
  });

  it('quotes commas, quotes, and newlines per RFC 4180', () => {
    const csv = piecesToCsv([
      piece({
        storageLocation: 'Rack A, near "gate"',
        source: 'line one\nline two',
      }),
    ]);

    expect(csv).toContain('"Rack A, near ""gate"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it('returns only the header row for an empty inventory', () => {
    const csv = piecesToCsv([]);

    expect(csv.split('\r\n')[0]).toContain('id,projectId');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});
