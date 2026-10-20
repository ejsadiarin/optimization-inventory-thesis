import type {
  InventoryMatch,
  MatchGroup,
  MatchPiece,
  MatchRequirement,
} from './types';

const FIT_TOLERANCE = 1e-9;

function isRetired(piece: MatchPiece): boolean {
  return piece.retired || piece.condition === 'Retired';
}

function meets(value: number, required: number): boolean {
  return value + FIT_TOLERANCE >= required;
}

function isExact(value: number, required: number): boolean {
  return Math.abs(value - required) <= FIT_TOLERANCE;
}

function phenolicMatch(
  requirement: MatchRequirement,
  piece: MatchPiece,
): InventoryMatch | null {
  const requiredLength = requirement.length;
  const requiredWidth = requirement.width ?? 0;
  if (requiredLength <= 0 || requiredWidth <= 0) return null;

  const orientations = [
    { length: piece.length, width: piece.width },
    { length: piece.width, width: piece.length },
  ];

  const surpluses = orientations
    .filter(
      (orientation) =>
        meets(orientation.length, requiredLength) &&
        meets(orientation.width, requiredWidth),
    )
    .map((orientation) => ({
      length: orientation.length - requiredLength,
      width: orientation.width - requiredWidth,
    }));

  if (surpluses.length === 0) return null;

  const requiresCutting = !surpluses.some(
    (surplus) => isExact(surplus.length, 0) && isExact(surplus.width, 0),
  );
  const surplusMaxDimension = Math.min(
    ...surpluses.map((surplus) => Math.max(surplus.length, surplus.width)),
  );

  return {
    pieceId: piece.id,
    piece,
    requiresCutting,
    surplusArea: Math.max(
      0,
      piece.length * piece.width - requiredLength * requiredWidth,
    ),
    surplusMaxDimension,
  };
}

function lumberMatch(
  requirement: MatchRequirement,
  piece: MatchPiece,
): InventoryMatch | null {
  if (!requirement.crossSection || !piece.crossSection) return null;
  if (requirement.crossSection !== piece.crossSection) return null;
  if (!meets(piece.length, requirement.length)) return null;

  const surplus = piece.length - requirement.length;

  return {
    pieceId: piece.id,
    piece,
    requiresCutting: !isExact(surplus, 0),
    surplusArea: Math.max(0, surplus),
    surplusMaxDimension: Math.max(0, surplus),
  };
}

function matchPiece(
  requirement: MatchRequirement,
  piece: MatchPiece,
): InventoryMatch | null {
  if (isRetired(piece)) return null;
  if (piece.materialType !== requirement.materialType) return null;

  if (requirement.materialType === 'phenolic') {
    return phenolicMatch(requirement, piece);
  }

  return lumberMatch(requirement, piece);
}

function bySmallestFit(a: InventoryMatch, b: InventoryMatch): number {
  return (
    a.surplusArea - b.surplusArea ||
    a.surplusMaxDimension - b.surplusMaxDimension ||
    a.piece.length - b.piece.length ||
    a.piece.width - b.piece.width ||
    a.pieceId.localeCompare(b.pieceId)
  );
}

export function matchInventory(
  requirements: MatchRequirement[],
  pieces: MatchPiece[],
): MatchGroup[] {
  return requirements.map((requirement) => {
    const candidates = pieces
      .map((piece) => matchPiece(requirement, piece))
      .filter((candidate): candidate is InventoryMatch => candidate !== null)
      .sort(bySmallestFit);

    return {
      requirement,
      candidates,
      bestMatch: candidates[0] ?? null,
    };
  });
}

export function remainingRequirements(
  groups: MatchGroup[],
  satisfiedRequirementIds: ReadonlySet<string>,
): MatchRequirement[] {
  return groups
    .filter((group) => !satisfiedRequirementIds.has(group.requirement.id))
    .map((group) => group.requirement);
}
