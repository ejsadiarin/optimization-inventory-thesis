import type { MatchPiece, MatchRequirement } from '@/engine/types';
import { crossSectionLabel, formatMeters } from '@/lib/format';

export function requirementDimensions(requirement: MatchRequirement): string {
  if (requirement.materialType === 'lumber') {
    return `${formatMeters(requirement.length)} · ${crossSectionLabel(requirement.crossSection ?? '—')}`;
  }
  return `${formatMeters(requirement.length)} × ${formatMeters(requirement.width ?? 0)}`;
}

export function candidateDimensions(piece: MatchPiece): string {
  if (piece.materialType === 'lumber') {
    return `${formatMeters(piece.length)} · ${crossSectionLabel(piece.crossSection ?? '—')}`;
  }
  return `${formatMeters(piece.length)} × ${formatMeters(piece.width)}`;
}

export function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}
