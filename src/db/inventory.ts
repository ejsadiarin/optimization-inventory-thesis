import {
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  dataWithId,
  docsWithData,
  projectCollection,
  projectDoc,
  requireProjectId,
} from '@/lib/firestore-helpers';
import type {
  CrossSection,
  MaterialType,
  Piece,
  PieceCondition,
  UsageLogEntry,
} from './types';
import { generateId } from '@/lib/ids';
import { normalizePieceDimensions } from '@/lib/pieces';
import { queueWrite } from '@/lib/syncStatus';

export interface AddPieceInput {
  projectId: string;
  materialType: MaterialType;
  length: number;
  width?: number;
  thickness?: number;
  crossSection?: CrossSection;
  condition?: Extract<PieceCondition, 'Good' | 'For Inspection'>;
  storageLocation?: string;
  dateAdded?: string;
  source?: string;
}

function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
}

function validateDimensions(input: {
  materialType: MaterialType;
  length: number;
  width: number;
  thickness: number;
  crossSection?: CrossSection;
}): void {
  assertPositive(input.length, 'Length');

  if (input.materialType === 'phenolic') {
    assertPositive(input.width, 'Width');
    assertPositive(input.thickness, 'Thickness');
  }

  if (input.materialType === 'lumber' && !input.crossSection) {
    throw new Error('Lumber pieces require a cross-section.');
  }
}

export async function addPiece(input: AddPieceInput): Promise<Piece> {
  const projectId = requireProjectId(input.projectId);
  const dimensions = normalizePieceDimensions(input);
  const piece: Piece = {
    id: generateId(),
    projectId,
    materialType: input.materialType,
    length: input.length,
    ...dimensions,
    condition: input.condition ?? 'Good',
    usageCount: 0,
    storageLocation: input.storageLocation?.trim() ?? '',
    dateAdded: input.dateAdded ?? new Date().toISOString(),
    retired: false,
    source: input.source ?? 'manual',
  };

  validateDimensions(piece);
  const { crossSection, ...rest } = piece;
  queueWrite(
    setDoc(
      projectDoc(projectId, 'pieces', piece.id),
      crossSection ? { ...rest, crossSection } : rest,
    ),
  );
  return piece;
}

export async function getPiece(projectId: string, id: string): Promise<Piece | undefined> {
  const snapshot = await getDoc(
    projectDoc(requireProjectId(projectId), 'pieces', id),
  );
  return dataWithId<Piece>(snapshot);
}

export async function listPieces(projectId: string): Promise<Piece[]> {
  const snapshot = await getDocs(
    projectCollection(requireProjectId(projectId), 'pieces'),
  );
  return docsWithData<Piece>(snapshot);
}

export async function getActivePieces(projectId: string): Promise<Piece[]> {
  const pieces = await listPieces(projectId);
  return pieces.filter((piece) => !piece.retired && piece.condition !== 'Retired');
}

export function daysInInventory(dateAdded: string, now: Date = new Date()): number {
  const added = new Date(dateAdded);
  if (Number.isNaN(added.getTime())) return 0;
  const milliseconds = now.getTime() - added.getTime();
  return Math.max(0, Math.floor(milliseconds / 86_400_000));
}

export async function getUsageLog(
  projectId: string,
  pieceId: string,
): Promise<UsageLogEntry[]> {
  const snapshot = await getDocs(
    query(
      projectCollection(requireProjectId(projectId), 'usageLog'),
      where('pieceId', '==', pieceId),
    ),
  );

  return docsWithData<UsageLogEntry>(snapshot).sort(
    (a, b) =>
      Date.parse(b.date) - Date.parse(a.date) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export interface UpdatePieceInput {
  length?: number;
  width?: number;
  thickness?: number;
  crossSection?: CrossSection;
  condition?: PieceCondition;
  storageLocation?: string;
}

export async function updatePiece(
  projectId: string,
  id: string,
  input: UpdatePieceInput,
): Promise<Piece | undefined> {
  const reference = projectDoc(requireProjectId(projectId), 'pieces', id);
  const existing = await getDoc(reference);
  if (!existing.exists()) return undefined;

  const piece = dataWithId<Piece>(existing);
  if (!piece) return undefined;

  const dimensions = normalizePieceDimensions({
    materialType: piece.materialType,
    width: input.width ?? piece.width,
    thickness: input.thickness ?? piece.thickness,
    crossSection: input.crossSection ?? piece.crossSection,
  });
  const merged: Piece = {
    ...piece,
    length: input.length ?? piece.length,
    ...dimensions,
    condition: input.condition ?? piece.condition,
    storageLocation: input.storageLocation?.trim() ?? piece.storageLocation,
  };
  merged.retired = merged.condition === 'Retired';

  validateDimensions(merged);
  queueWrite(
    updateDoc(reference, {
      length: merged.length,
      width: merged.width,
      thickness: merged.thickness,
      ...(merged.crossSection ? { crossSection: merged.crossSection } : {}),
      condition: merged.condition,
      storageLocation: merged.storageLocation,
      retired: merged.retired,
    }),
  );

  const updated = await getDoc(reference);
  return dataWithId<Piece>(updated);
}

export async function retirePiece(
  projectId: string,
  id: string,
): Promise<Piece | undefined> {
  const reference = projectDoc(requireProjectId(projectId), 'pieces', id);
  const existing = await getDoc(reference);
  if (!existing.exists()) return undefined;

  queueWrite(updateDoc(reference, { condition: 'Retired', retired: true }));

  const updated = await getDoc(reference);
  return dataWithId<Piece>(updated);
}

// Firestore transactions do not work offline, so recording usage uses a queued
// writeBatch. Write promises only settle after the backend acknowledges them, so
// committing in the background keeps offline usage responsive; the local cache
// applies both writes immediately and the SDK flushes them on reconnect.
// A concurrent offline edit can leave a stale threshold condition; the count
// still increments, and we accept that rare race per ADR-0006.
export async function recordUsage(
  pieceId: string,
  projectId: string,
  structuralMemberLabel: string,
  date = new Date().toISOString(),
): Promise<Piece> {
  const scopedProjectId = requireProjectId(projectId);
  const piece = await getPiece(scopedProjectId, pieceId);
  if (!piece) throw new Error('Piece not found.');
  if (piece.projectId !== scopedProjectId) {
    throw new Error('Piece does not belong to this project.');
  }
  if (piece.retired || piece.condition === 'Retired') {
    throw new Error('Retired pieces cannot be used.');
  }

  const usageCount = piece.usageCount + 1;
  const crossedInspectionThreshold = piece.usageCount < 5 && usageCount >= 5;
  const condition: PieceCondition = crossedInspectionThreshold
    ? 'For Inspection'
    : piece.condition;
  const now = new Date().toISOString();
  const entryId = generateId();
  const firestore = db;
  if (!firestore) throw new Error('Firestore is not configured.');

  const batch = writeBatch(firestore);
  batch.update(projectDoc(scopedProjectId, 'pieces', pieceId), {
    usageCount: increment(1),
    condition,
  });
  batch.set(projectDoc(scopedProjectId, 'usageLog', entryId), {
    id: entryId,
    pieceId,
    projectId: scopedProjectId,
    structuralMemberLabel,
    date,
    createdAt: now,
  });
  queueWrite(batch.commit());

  const updated = await getPiece(scopedProjectId, pieceId);
  if (!updated) throw new Error('Piece not found after recording usage.');
  return updated;
}

export type PieceSortKey =
  | 'id'
  | 'dimensions'
  | 'materialType'
  | 'condition'
  | 'usageCount'
  | 'storageLocation'
  | 'dateAdded';

export interface PieceQuery {
  search?: string;
  materialType?: MaterialType | 'all';
  condition?: PieceCondition | 'all';
  minUsage?: number;
  maxUsage?: number;
  sortKey?: PieceSortKey;
  sortDirection?: 'asc' | 'desc';
}

export function queryPieces(pieces: Piece[], query: PieceQuery = {}): Piece[] {
  const search = query.search?.trim().toLowerCase() ?? '';

  const filtered = pieces.filter((piece) => {
    if (query.materialType && query.materialType !== 'all' && piece.materialType !== query.materialType) {
      return false;
    }
    if (query.condition && query.condition !== 'all' && piece.condition !== query.condition) {
      return false;
    }
    if (query.minUsage !== undefined && piece.usageCount < query.minUsage) return false;
    if (query.maxUsage !== undefined && piece.usageCount > query.maxUsage) return false;
    if (!search) return true;

    const haystack = [
      piece.id,
      piece.materialType,
      piece.materialType === 'phenolic' ? 'phenolic board plywood' : 'lumber coco',
      piece.length.toFixed(2),
      piece.width.toFixed(2),
      piece.thickness.toFixed(2),
      `${piece.length.toFixed(2)} x ${piece.width.toFixed(2)} x ${piece.thickness.toFixed(2)}`,
      piece.crossSection ?? '',
      piece.condition,
      piece.storageLocation,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });

  const sorted = [...filtered];
  const direction = query.sortDirection === 'desc' ? -1 : 1;
  const sortKey = query.sortKey ?? 'dateAdded';

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'id':
        return direction * a.id.localeCompare(b.id);
      case 'dimensions':
        return (
          direction *
          (a.length - b.length || a.width - b.width || a.thickness - b.thickness)
        );
      case 'materialType':
        return direction * a.materialType.localeCompare(b.materialType);
      case 'condition': {
        const order: Record<PieceCondition, number> = {
          Good: 0,
          'For Inspection': 1,
          Retired: 2,
        };
        return direction * (order[a.condition] - order[b.condition]);
      }
      case 'usageCount':
        return direction * (a.usageCount - b.usageCount);
      case 'storageLocation':
        return direction * a.storageLocation.localeCompare(b.storageLocation);
      case 'dateAdded':
        return direction * (Date.parse(a.dateAdded) - Date.parse(b.dateAdded));
      default:
        return 0;
    }
  });

  return sorted;
}
