import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addPiece,
  daysInInventory,
  getActivePieces,
  getPiece,
  getUsageLog,
  queryPieces,
  recordUsage,
  retirePiece,
  updatePiece,
} from './inventory';
import { createProject } from './projects';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function makeProject() {
  return createProject({ name: 'Inventory Site' });
}

describe('inventory store', () => {
  it('adds individual pieces with unique ids and sensible defaults', async () => {
    const project = await makeProject();

    const first = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });
    const second = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });

    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({
      projectId: project.id,
      materialType: 'phenolic',
      condition: 'Good',
      usageCount: 0,
      storageLocation: 'Rack A',
      retired: false,
    });
    expect(Number.isNaN(Date.parse(first.dateAdded))).toBe(false);
    await expect(getPiece(first.id)).resolves.toEqual(first);
  });
});

describe('inventory edits and retirement', () => {
  it('edits dimensions, storage location, and condition while preserving usage history', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 2.4,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });

    const updated = await updatePiece(piece.id, {
      length: 1.1,
      condition: 'For Inspection',
      storageLocation: 'Rack B',
    });

    expect(updated).toMatchObject({
      id: piece.id,
      length: 1.1,
      width: 2.4,
      condition: 'For Inspection',
      storageLocation: 'Rack B',
      usageCount: 0,
      dateAdded: piece.dateAdded,
    });
  });

  it('rejects an edit that would make a phenolic piece dimensionally invalid', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 2.4,
      thickness: 0.018,
    });

    await expect(updatePiece(piece.id, { width: 0 })).rejects.toThrow(/width/i);
    await expect(updatePiece(piece.id, { thickness: -1 })).rejects.toThrow(/thickness/i);
  });

  it('retires a piece softly, hiding it from active inventory but preserving it', async () => {
    const project = await makeProject();
    const active = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 2.4,
      thickness: 0.018,
    });
    const retired = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await recordUsage(retired.id, project.id, 'B1', '2026-01-02T00:00:00.000Z');
    const result = await retirePiece(retired.id);

    expect(result).toMatchObject({ condition: 'Retired', retired: true });
    const activePieces = await getActivePieces(project.id);
    expect(activePieces.map((piece) => piece.id)).toEqual([active.id]);
    await expect(getPiece(retired.id)).resolves.toMatchObject({ retired: true, usageCount: 1 });
    await expect(getUsageLog(retired.id)).resolves.toHaveLength(1);
  });
});

describe('inventory usage lifecycle', () => {
  it('increments usage, records a log entry, and flags For Inspection at five uses', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3.6,
      crossSection: '2x4',
      storageLocation: 'Rack C',
    });

    let updated = piece;
    for (let use = 1; use <= 4; use += 1) {
      updated = await recordUsage(
        piece.id,
        project.id,
        `B${use}`,
        `2026-02-0${use}T00:00:00.000Z`,
      );
      expect(updated.usageCount).toBe(use);
      expect(updated.condition).toBe('Good');
    }

    updated = await recordUsage(piece.id, project.id, 'C1', '2026-02-05T00:00:00.000Z');

    expect(updated.usageCount).toBe(5);
    expect(updated.condition).toBe('For Inspection');

    const log = await getUsageLog(piece.id);
    expect(log).toHaveLength(5);
    expect(log.map((entry) => entry.structuralMemberLabel).sort()).toEqual([
      'B1',
      'B2',
      'B3',
      'B4',
      'C1',
    ]);
  });

  it('allows an engineer to return an inspected piece to Good, then re-flags on further use', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 4.8,
      crossSection: '2x2',
    });

    for (let use = 1; use <= 5; use += 1) {
      await recordUsage(piece.id, project.id, `C${use}`);
    }

    const inspected = await updatePiece(piece.id, { condition: 'Good' });
    expect(inspected).toMatchObject({ condition: 'Good', usageCount: 5 });

    const reused = await recordUsage(piece.id, project.id, 'B9');
    expect(reused).toMatchObject({ condition: 'For Inspection', usageCount: 6 });
  });

  it('does not record usage against a retired piece', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1,
      width: 1,
      thickness: 0.018,
    });
    await retirePiece(piece.id);

    await expect(recordUsage(piece.id, project.id, 'C1')).rejects.toThrow(/retired/i);
    await expect(getUsageLog(piece.id)).resolves.toHaveLength(0);
  });

  it('returns the usage log newest first', async () => {
    const project = await makeProject();
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await recordUsage(piece.id, project.id, 'C1', '2026-01-01T00:00:00.000Z');
    await recordUsage(piece.id, project.id, 'B2', '2026-03-01T00:00:00.000Z');
    await recordUsage(piece.id, project.id, 'S3', '2026-02-01T00:00:00.000Z');

    const log = await getUsageLog(piece.id);
    expect(log.map((entry) => entry.structuralMemberLabel)).toEqual(['B2', 'S3', 'C1']);
  });
});

describe('inventory search, filter, and sort', () => {
  async function seedPieces() {
    const project = await makeProject();
    const phenolic = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      storageLocation: 'Rack A',
      dateAdded: '2026-01-01T00:00:00.000Z',
    });
    const lumber2x3 = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3.0,
      crossSection: '2x3',
      storageLocation: 'Rack B',
      dateAdded: '2026-02-01T00:00:00.000Z',
    });
    const lumber2x4 = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 4.8,
      crossSection: '2x4',
      storageLocation: 'Ground',
      dateAdded: '2026-03-01T00:00:00.000Z',
    });

    for (let use = 0; use < 3; use += 1) {
      await recordUsage(lumber2x4.id, project.id, `B${use + 1}`);
    }

    return { project, phenolic, lumber2x3, lumber2x4 };
  }

  it('searches by dimension, material type, cross-section, and storage location', async () => {
    const { project, phenolic, lumber2x3, lumber2x4 } = await seedPieces();
    const pieces = await getActivePieces(project.id);

    expect(queryPieces(pieces, { search: '2.44' }).map((piece) => piece.id)).toEqual([phenolic.id]);
    expect(queryPieces(pieces, { search: 'lumber' }).map((piece) => piece.id).sort()).toEqual(
      [lumber2x3.id, lumber2x4.id].sort(),
    );
    expect(queryPieces(pieces, { search: '2x3' }).map((piece) => piece.id)).toEqual([lumber2x3.id]);
    expect(queryPieces(pieces, { search: 'rack b' }).map((piece) => piece.id)).toEqual([
      lumber2x3.id,
    ]);
    expect(queryPieces(pieces, { search: 'PHENOLIC ground' })).toHaveLength(0);
  });

  it('filters by material type, condition, and inclusive usage range', async () => {
    const { project } = await seedPieces();
    const pieces = await getActivePieces(project.id);

    expect(queryPieces(pieces, { materialType: 'lumber' })).toHaveLength(2);
    expect(queryPieces(pieces, { condition: 'Good' })).toHaveLength(3);
    expect(queryPieces(pieces, { minUsage: 1 })).toHaveLength(1);
    expect(queryPieces(pieces, { minUsage: 3, maxUsage: 3 })).toHaveLength(1);
    expect(queryPieces(pieces, { minUsage: 4 })).toHaveLength(0);
  });

  it('sorts by any column in either direction', async () => {
    const { project, phenolic, lumber2x3, lumber2x4 } = await seedPieces();
    const pieces = await getActivePieces(project.id);

    expect(queryPieces(pieces, { sortKey: 'usageCount', sortDirection: 'asc' }).map((p) => p.usageCount)).toEqual([
      0, 0, 3,
    ]);
    expect(queryPieces(pieces, { sortKey: 'usageCount', sortDirection: 'desc' })[0]?.id).toBe(
      lumber2x4.id,
    );
    expect(queryPieces(pieces, { sortKey: 'dimensions', sortDirection: 'asc' }).map((p) => p.id)).toEqual([
      phenolic.id,
      lumber2x3.id,
      lumber2x4.id,
    ]);
    expect(queryPieces(pieces, { sortKey: 'storageLocation', sortDirection: 'asc' }).map((p) => p.storageLocation)).toEqual([
      'Ground',
      'Rack A',
      'Rack B',
    ]);
    expect(queryPieces(pieces, { sortKey: 'dateAdded', sortDirection: 'desc' })[0]?.id).toBe(
      lumber2x4.id,
    );
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
