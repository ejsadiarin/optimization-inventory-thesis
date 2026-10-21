import type { MatchPiece, MatchRequirement } from '@/engine/types';
import { crossSectionLabel, formatMeters } from '@/lib/format';

interface MatchDimensions {
  materialType: MatchPiece['materialType'];
  length: number;
  width?: number;
  crossSection?: MatchPiece['crossSection'];
}

function materialDimensions(item: MatchDimensions): string {
  if (item.materialType === 'lumber') {
    return `${formatMeters(item.length)} · ${crossSectionLabel(item.crossSection ?? '—')}`;
  }
  return `${formatMeters(item.length)} × ${formatMeters(item.width ?? 0)}`;
}

export function requirementDimensions(requirement: MatchRequirement): string {
  return materialDimensions(requirement);
}

export function candidateDimensions(piece: MatchPiece): string {
  return materialDimensions(piece);
}

export function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}
