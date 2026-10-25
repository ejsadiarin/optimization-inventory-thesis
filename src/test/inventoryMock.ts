import { generateId } from '@/lib/ids';
import { normalizePieceDimensions } from '@/lib/pieces';
import type { CrossSection, MaterialType, Piece, PieceCondition, UsageLogEntry } from '@/db/types';
import type { AddPieceInput, UpdatePieceInput } from '@/db/inventory';

let pieces: Piece[] = [];
let usageLog: UsageLogEntry[] = [];
let sequence = 0;

function nextTimestamp(): string {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, sequence)).toISOString();
  sequence += 1;
  return timestamp;
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

export function resetInventoryMock(): void {
  pieces = [];
  usageLog = [];
  sequence = 0;
}

export async function addPiece(input: AddPieceInput): Promise<Piece> {
  const dimensions = normalizePieceDimensions(input);
  const piece: Piece = {
    id: generateId(),
    projectId: input.projectId,
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
  pieces.push(piece);
  return piece;
}

export async function getPiece(projectId: string, id: string): Promise<Piece | undefined> {
  return pieces.find((piece) => piece.projectId === projectId && piece.id === id);
}

export async function listPieces(projectId: string): Promise<Piece[]> {
  return pieces.filter((piece) => piece.projectId === projectId);
}

export async function getActivePieces(projectId: string): Promise<Piece[]> {
  return (await listPieces(projectId)).filter(
    (piece) => !piece.retired && piece.condition !== 'Retired',
  );
}

export async function getUsageLog(
  projectId: string,
  pieceId: string,
): Promise<UsageLogEntry[]> {
  return usageLog
    .filter((entry) => entry.projectId === projectId && entry.pieceId === pieceId)
    .sort(
      (a, b) =>
        Date.parse(b.date) - Date.parse(a.date) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
}

export async function updatePiece(
  projectId: string,
  id: string,
  input: UpdatePieceInput,
): Promise<Piece | undefined> {
  const index = pieces.findIndex(
    (piece) => piece.projectId === projectId && piece.id === id,
  );
  if (index === -1) return undefined;
  const piece = pieces[index]!;

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
  pieces[index] = merged;
  return merged;
}

export async function retirePiece(
  projectId: string,
  id: string,
): Promise<Piece | undefined> {
  const index = pieces.findIndex(
    (piece) => piece.projectId === projectId && piece.id === id,
  );
  if (index === -1) return undefined;

  const retired: Piece = {
    ...pieces[index]!,
    condition: 'Retired',
    retired: true,
  };
  pieces[index] = retired;
  return retired;
}

export async function recordUsage(
  pieceId: string,
  projectId: string,
  structuralMemberLabel: string,
  date = new Date().toISOString(),
): Promise<Piece> {
  const index = pieces.findIndex((piece) => piece.id === pieceId);
  const piece = index === -1 ? undefined : pieces[index]!;
  if (!piece) throw new Error('Piece not found.');
  if (piece.projectId !== projectId) {
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

  const updated: Piece = { ...piece, usageCount, condition };
  pieces[index] = updated;
  usageLog.push({
    id: generateId(),
    pieceId,
    projectId,
    structuralMemberLabel,
    date,
    createdAt: nextTimestamp(),
  });

  return updated;
}
