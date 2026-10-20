import { db } from './db';
import type { CrossSection, MaterialType, Piece, PieceCondition } from './types';
import { generateId } from '@/lib/ids';

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
  const piece: Piece = {
    id: generateId(),
    projectId: input.projectId,
    materialType: input.materialType,
    length: input.length,
    width: input.materialType === 'lumber' ? 0 : (input.width ?? 0),
    thickness: input.materialType === 'lumber' ? 0 : (input.thickness ?? 0),
    crossSection: input.materialType === 'lumber' ? input.crossSection : undefined,
    condition: input.condition ?? 'Good',
    usageCount: 0,
    storageLocation: input.storageLocation?.trim() ?? '',
    dateAdded: input.dateAdded ?? new Date().toISOString(),
    retired: false,
    source: input.source ?? 'manual',
  };

  validateDimensions(piece);
  await db.pieces.add(piece);
  return piece;
}

export async function getPiece(id: string): Promise<Piece | undefined> {
  return db.pieces.get(id);
}

export async function listPieces(projectId: string): Promise<Piece[]> {
  return db.pieces.where('projectId').equals(projectId).toArray();
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

export async function getUsageLog(pieceId: string) {
  const entries = await db.usageLog.where('pieceId').equals(pieceId).toArray();
  return entries.sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
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

export async function updatePiece(id: string, input: UpdatePieceInput): Promise<Piece | undefined> {
  const piece = await getPiece(id);
  if (!piece) return undefined;

  const merged: Piece = {
    ...piece,
    length: input.length ?? piece.length,
    width: piece.materialType === 'lumber' ? 0 : (input.width ?? piece.width),
    thickness: piece.materialType === 'lumber' ? 0 : (input.thickness ?? piece.thickness),
    crossSection:
      piece.materialType === 'lumber' ? (input.crossSection ?? piece.crossSection) : undefined,
    condition: input.condition ?? piece.condition,
    storageLocation: input.storageLocation?.trim() ?? piece.storageLocation,
  };
  merged.retired = merged.condition === 'Retired';

  validateDimensions(merged);
  await db.pieces.update(id, {
    length: merged.length,
    width: merged.width,
    thickness: merged.thickness,
    crossSection: merged.crossSection,
    condition: merged.condition,
    storageLocation: merged.storageLocation,
    retired: merged.retired,
  });
  return getPiece(id);
}

export async function retirePiece(id: string): Promise<Piece | undefined> {
  const piece = await getPiece(id);
  if (!piece) return undefined;

  await db.pieces.update(id, { condition: 'Retired', retired: true });
  return getPiece(id);
}

export async function recordUsage(
  pieceId: string,
  projectId: string,
  structuralMemberLabel: string,
  date = new Date().toISOString(),
): Promise<Piece> {
  const piece = await getPiece(pieceId);
  if (!piece) throw new Error('Piece not found.');
  if (piece.projectId !== projectId) throw new Error('Piece does not belong to this project.');
  if (piece.retired || piece.condition === 'Retired') throw new Error('Retired pieces cannot be used.');

  const usageCount = piece.usageCount + 1;
  const condition: PieceCondition = usageCount >= 5 ? 'For Inspection' : piece.condition;
  const now = new Date().toISOString();

  await db.transaction('rw', db.pieces, db.usageLog, async () => {
    await db.pieces.update(pieceId, { usageCount, condition });
    await db.usageLog.add({
      id: generateId(),
      pieceId,
      projectId,
      structuralMemberLabel,
      date,
      createdAt: now,
    });
  });

  const updated = await getPiece(pieceId);
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
