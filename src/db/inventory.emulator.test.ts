import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  disableNetwork,
  enableNetwork,
  getDocFromServer,
  setDoc,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { projectDoc } from '@/lib/firestore-helpers';
import {
  addPiece,
  getActivePieces,
  getPiece,
  getUsageLog,
  listPieces,
  recordUsage,
  retirePiece,
  updatePiece,
  type AddPieceInput,
} from './inventory';
import { createProject } from './projects';
import type { ProjectOwner } from './types';
import {
  clearAuth,
  clearFirestore,
  flushPendingWrites,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore is not configured.');
  return db;
}

beforeAll(async () => {
  await flushPendingWrites();
  await clearAuth();
  await clearFirestore();
  const uid = await signInDemoUser();
  owner = { uid, name: 'Demo Engineer' };
});

beforeEach(async () => {
  await flushPendingWrites();
  await clearFirestore();
});

afterAll(async () => {
  await flushPendingWrites();
  await signOutDemoUser();
});

async function createTestProject(name = 'Inventory Site'): Promise<string> {
  const created = await createProject({ name }, owner);
  return created.project.id;
}

function addPhenolicPiece(projectId: string, overrides: Partial<AddPieceInput> = {}) {
  return addPiece({
    projectId,
    materialType: 'phenolic',
    length: 1.22,
    width: 2.44,
    thickness: 0.018,
    storageLocation: 'Rack A',
    ...overrides,
  });
}

describe('inventory pieces on Firestore', () => {
  it('adds, lists, and gets pieces scoped to their project', async () => {
    const projectId = await createTestProject('Inventory Site');
    const otherProjectId = await createTestProject('Other Site');

    const first = await addPhenolicPiece(projectId);
    const second = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3.6,
      crossSection: '2x4',
      storageLocation: 'Rack C',
    });
    await addPhenolicPiece(otherProjectId, { storageLocation: 'Other Rack' });

    const pieces = await listPieces(projectId);

    expect(pieces.map((piece) => piece.id).sort()).toEqual([first.id, second.id].sort());
    expect(first).toMatchObject({
      projectId,
      materialType: 'phenolic',
      condition: 'Good',
      usageCount: 0,
      storageLocation: 'Rack A',
      retired: false,
    });
    expect(first.crossSection).toBeUndefined();
    expect(Number.isNaN(Date.parse(first.dateAdded))).toBe(false);
    await expect(getPiece(projectId, first.id)).resolves.toEqual(first);
    await expect(getPiece(otherProjectId, first.id)).resolves.toBeUndefined();
    await expect(listPieces(otherProjectId)).resolves.toHaveLength(1);
  });

  it('updates dimensions, condition, and storage location and refetches the piece', async () => {
    const projectId = await createTestProject();
    const piece = await addPhenolicPiece(projectId);

    const updated = await updatePiece(projectId, piece.id, {
      length: 1.1,
      condition: 'For Inspection',
      storageLocation: 'Rack B',
    });

    expect(updated).toMatchObject({
      id: piece.id,
      projectId,
      length: 1.1,
      width: 2.44,
      thickness: 0.018,
      condition: 'For Inspection',
      storageLocation: 'Rack B',
      usageCount: 0,
      dateAdded: piece.dateAdded,
      retired: false,
    });
    await expect(getPiece(projectId, piece.id)).resolves.toEqual(updated);
  });

  it('rejects invalid dimensions and does not update through the wrong project', async () => {
    const projectId = await createTestProject('Inventory Site');
    const otherProjectId = await createTestProject('Other Site');
    const piece = await addPhenolicPiece(projectId);

    await expect(updatePiece(projectId, piece.id, { width: 0 })).rejects.toThrow(/width/i);
    await expect(updatePiece(projectId, piece.id, { thickness: -1 })).rejects.toThrow(
      /thickness/i,
    );
    await expect(
      updatePiece(otherProjectId, piece.id, { storageLocation: 'Elsewhere' }),
    ).resolves.toBeUndefined();
    await expect(
      updatePiece(projectId, 'missing-piece', { storageLocation: 'Elsewhere' }),
    ).resolves.toBeUndefined();
  });

  it('retires a piece softly, hiding it from active inventory but preserving it', async () => {
    const projectId = await createTestProject();
    const otherProjectId = await createTestProject('Other Site');
    const active = await addPhenolicPiece(projectId);
    const retired = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await recordUsage(retired.id, projectId, 'B1', '2026-01-02T00:00:00.000Z');
    await expect(retirePiece(otherProjectId, retired.id)).resolves.toBeUndefined();
    await expect(getUsageLog(otherProjectId, retired.id)).resolves.toHaveLength(0);
    const result = await retirePiece(projectId, retired.id);

    expect(result).toMatchObject({ condition: 'Retired', retired: true });
    const activePieces = await getActivePieces(projectId);
    expect(activePieces.map((piece) => piece.id)).toEqual([active.id]);
    await expect(getPiece(projectId, retired.id)).resolves.toMatchObject({
      retired: true,
      usageCount: 1,
    });
    await expect(getUsageLog(projectId, retired.id)).resolves.toHaveLength(1);
    await expect(retirePiece(projectId, 'missing-piece')).resolves.toBeUndefined();
  });

  it('requires a project id for reads and writes', async () => {
    await expect(listPieces('')).rejects.toThrow(/project id is required/i);
    await expect(getPiece('', 'piece-1')).rejects.toThrow(/project id is required/i);
    await expect(
      addPhenolicPiece(''),
    ).rejects.toThrow(/project id is required/i);
    await expect(updatePiece('', 'piece-1', { length: 1 })).rejects.toThrow(
      /project id is required/i,
    );
    await expect(retirePiece('', 'piece-1')).rejects.toThrow(/project id is required/i);
    await expect(recordUsage('piece-1', '', 'C1')).rejects.toThrow(
      /project id is required/i,
    );
  });

  it('queues offline add and update writes and persists them after reconnecting', async () => {
    const projectId = await createTestProject('Offline CRUD Site');
    const firestore = requireDb();
    await disableNetwork(firestore);

    let pieceId = '';
    try {
      const piece = await addPhenolicPiece(projectId, {
        storageLocation: 'Rack Offline',
      });
      pieceId = piece.id;

      const updated = await updatePiece(projectId, piece.id, {
        storageLocation: 'Rack Synced',
      });
      expect(updated).toMatchObject({ storageLocation: 'Rack Synced' });
      await expect(getPiece(projectId, piece.id)).resolves.toMatchObject({
        storageLocation: 'Rack Synced',
      });
    } finally {
      await enableNetwork(firestore);
    }

    await waitForPendingWrites(firestore);
    const persisted = await getDocFromServer(
      projectDoc(projectId, 'pieces', pieceId),
    );
    expect(persisted.exists()).toBe(true);
    expect(persisted.data()).toMatchObject({ storageLocation: 'Rack Synced' });
  });
});

describe('inventory usage log on Firestore', () => {
  it('records usage in one batch that increments the count and appends the log entry', async () => {
    const projectId = await createTestProject();
    const piece = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3.6,
      crossSection: '2x4',
      storageLocation: 'Rack C',
    });

    const updated = await recordUsage(
      piece.id,
      projectId,
      'Brace A',
      '2026-02-01T00:00:00.000Z',
    );

    expect(updated).toMatchObject({ usageCount: 1, condition: 'Good' });
    const log = await getUsageLog(projectId, piece.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      pieceId: piece.id,
      projectId,
      structuralMemberLabel: 'Brace A',
      date: '2026-02-01T00:00:00.000Z',
    });
    expect(Number.isNaN(Date.parse(log[0]!.createdAt))).toBe(false);
    await expect(getPiece(projectId, piece.id)).resolves.toMatchObject({ usageCount: 1 });
  });

  it('flags For Inspection on the fifth use and keeps later conditions', async () => {
    const projectId = await createTestProject();
    const piece = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 4.8,
      crossSection: '2x2',
    });

    let updated = piece;
    for (let use = 1; use <= 4; use += 1) {
      updated = await recordUsage(piece.id, projectId, `C${use}`);
      expect(updated.usageCount).toBe(use);
      expect(updated.condition).toBe('Good');
    }

    updated = await recordUsage(piece.id, projectId, 'C5');
    expect(updated).toMatchObject({ usageCount: 5, condition: 'For Inspection' });

    const inspected = await updatePiece(projectId, piece.id, { condition: 'Good' });
    expect(inspected).toMatchObject({ condition: 'Good', usageCount: 5 });

    const reused = await recordUsage(piece.id, projectId, 'B9');
    expect(reused).toMatchObject({ condition: 'Good', usageCount: 6 });
    await expect(getUsageLog(projectId, piece.id)).resolves.toHaveLength(6);
  });

  it('returns the usage log newest first by date then createdAt', async () => {
    const projectId = await createTestProject();
    const piece = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await recordUsage(piece.id, projectId, 'C1', '2026-01-01T00:00:00.000Z');
    await recordUsage(piece.id, projectId, 'B2', '2026-03-01T00:00:00.000Z');
    await recordUsage(piece.id, projectId, 'S3', '2026-02-01T00:00:00.000Z');

    const log = await getUsageLog(projectId, piece.id);
    expect(log.map((entry) => entry.structuralMemberLabel)).toEqual(['B2', 'S3', 'C1']);
  });

  it('rejects a missing piece, a wrong-project piece, and a retired piece', async () => {
    const projectId = await createTestProject('Inventory Site');
    const otherProjectId = await createTestProject('Other Site');
    const piece = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await expect(recordUsage('missing-piece', projectId, 'C1')).rejects.toThrow(
      /piece not found/i,
    );
    await expect(recordUsage(piece.id, otherProjectId, 'C1')).rejects.toThrow(
      /piece not found/i,
    );

    await setDoc(projectDoc(otherProjectId, 'pieces', piece.id), {
      ...piece,
      projectId,
    });
    await expect(recordUsage(piece.id, otherProjectId, 'C1')).rejects.toThrow(
      /does not belong to this project/i,
    );
    await expect(getUsageLog(otherProjectId, piece.id)).resolves.toHaveLength(0);

    await retirePiece(projectId, piece.id);
    await expect(recordUsage(piece.id, projectId, 'C2')).rejects.toThrow(/retired/i);
    await expect(getUsageLog(projectId, piece.id)).resolves.toHaveLength(0);
    await expect(getPiece(projectId, piece.id)).resolves.toMatchObject({
      usageCount: 0,
      retired: true,
    });
  });

  it('queues usage offline and flushes both the count and the log on reconnect', async () => {
    const projectId = await createTestProject('Offline Site');
    const piece = await addPiece({
      projectId,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });
    await getPiece(projectId, piece.id);

    const firestore = requireDb();
    await disableNetwork(firestore);
    try {
      const queued = await recordUsage(
        piece.id,
        projectId,
        'Offline Brace',
        '2026-04-01T00:00:00.000Z',
      );
      expect(queued.usageCount).toBe(1);
      await expect(getPiece(projectId, piece.id)).resolves.toMatchObject({
        usageCount: 1,
      });
    } finally {
      await enableNetwork(firestore);
    }

    await waitForPendingWrites(firestore);

    await expect(getPiece(projectId, piece.id)).resolves.toMatchObject({
      usageCount: 1,
      condition: 'Good',
    });
    const log = await getUsageLog(projectId, piece.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      structuralMemberLabel: 'Offline Brace',
      date: '2026-04-01T00:00:00.000Z',
    });
  });
});
