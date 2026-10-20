import type { Piece } from '@/db/types';

const COLUMNS = [
  'id',
  'projectId',
  'materialType',
  'length',
  'width',
  'thickness',
  'crossSection',
  'condition',
  'usageCount',
  'storageLocation',
  'dateAdded',
  'retired',
  'source',
] as const;

const ROW_SEPARATOR = '\r\n';

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function pieceToRow(piece: Piece): string {
  return [
    piece.id,
    piece.projectId,
    piece.materialType,
    String(piece.length),
    String(piece.width),
    String(piece.thickness),
    piece.crossSection ?? '',
    piece.condition,
    String(piece.usageCount),
    piece.storageLocation,
    piece.dateAdded,
    String(piece.retired),
    piece.source,
  ]
    .map(escapeCsvField)
    .join(',');
}

/**
 * Serializes inventory pieces to RFC 4180 CSV. All persisted Piece fields are
 * included so thesis exports preserve retired records and cross-sections.
 */
export function piecesToCsv(pieces: readonly Piece[]): string {
  return [COLUMNS.join(','), ...pieces.map(pieceToRow), ''].join(ROW_SEPARATOR);
}
