import type { CrossSection, MaterialType, Piece } from '@/db/types';
import type { MatchPiece } from '@/engine/types';

export function toMatchPiece(piece: Piece): MatchPiece {
  return {
    id: piece.id,
    materialType: piece.materialType,
    length: piece.length,
    width: piece.width,
    crossSection: piece.crossSection,
    condition: piece.condition,
    retired: piece.retired,
    usageCount: piece.usageCount,
  };
}

export interface PieceDimensionInput {
  materialType: MaterialType;
  width?: number;
  thickness?: number;
  crossSection?: CrossSection;
}

export interface NormalizedPieceDimensions {
  width: number;
  thickness: number;
  crossSection: CrossSection | undefined;
}

export function normalizePieceDimensions(
  input: PieceDimensionInput,
): NormalizedPieceDimensions {
  if (input.materialType === 'lumber') {
    return { width: 0, thickness: 0, crossSection: input.crossSection };
  }

  return {
    width: input.width ?? 0,
    thickness: input.thickness ?? 0,
    crossSection: undefined,
  };
}
