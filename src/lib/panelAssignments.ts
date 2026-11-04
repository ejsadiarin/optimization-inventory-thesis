import {
  allocatePanelsToPieces,
  packPanelsIntoStock,
} from '@/engine/plywood';
import { matchInventory } from '@/engine/match';
import type {
  MatchPiece,
  MatchRequirement,
  PlywoodPanel,
  ReuseAllocation,
} from '@/engine/types';

export interface PanelAssignmentSummary {
  assignments: Record<string, string>;
  allocations: ReuseAllocation[];
  coveredPanelCount: number;
}

/**
 * Nests member panels into reusable phenolic pieces. Unlike the old
 * one-piece-per-panel assignment, a piece may cover several panels when they
 * fit together; the underlying packer guarantees no panel is booked twice.
 */
export function assignPanelsToPieces(
  panels: readonly PlywoodPanel[],
  pieces: readonly MatchPiece[],
): PanelAssignmentSummary {
  const allocations = allocatePanelsToPieces(panels, pieces);
  const assignments: Record<string, string> = {};

  for (const allocation of allocations) {
    for (const panelId of allocation.panelIds) {
      assignments[panelId] = allocation.pieceId;
    }
  }

  return {
    assignments,
    allocations,
    coveredPanelCount: Object.keys(assignments).length,
  };
}

export function countReusablePanels(
  panels: readonly PlywoodPanel[],
  pieces: readonly MatchPiece[],
): number {
  return assignPanelsToPieces(panels, pieces).coveredPanelCount;
}

/**
 * Checks whether another requirement still fits a piece after the requirements
 * already assigned to that piece. Phenolic pieces are repacked as a small
 * stock sheet; lumber keeps the existing one-requirement-per-piece rule.
 */
export function canFitRequirementAlongside(
  requirement: MatchRequirement,
  existingRequirements: readonly MatchRequirement[],
  piece: MatchPiece,
): boolean {
  if (piece.retired || piece.condition === 'Retired') return false;
  if (piece.materialType !== requirement.materialType) return false;

  if (requirement.materialType === 'lumber') {
    return (
      existingRequirements.length === 0 &&
      matchInventory([requirement], [piece])[0]?.candidates.length === 1
    );
  }

  const panels = [...existingRequirements, requirement]
    .filter(
      (item): item is MatchRequirement & { width: number } =>
        item.materialType === 'phenolic' && item.width !== undefined,
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      length: item.length,
      width: item.width,
    }));

  if (!panels.some((panel) => panel.id === requirement.id)) return false;

  const packing = packPanelsIntoStock(panels, {
    length: piece.length,
    width: piece.width,
  });
  return panels.every((panel) => packing.placedPanelIds.includes(panel.id));
}

export function allocationsForAssignments(
  acceptedByRequirement: ReadonlyMap<string, string>,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): ReuseAllocation[] {
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const requirementsByPiece = new Map<string, MatchRequirement[]>();

  for (const [requirementId, pieceId] of acceptedByRequirement) {
    const requirement = requirementById.get(requirementId);
    if (!requirement || requirement.materialType !== 'phenolic') continue;
    const existing = requirementsByPiece.get(pieceId) ?? [];
    existing.push(requirement);
    requirementsByPiece.set(pieceId, existing);
  }

  const allocations: ReuseAllocation[] = [];

  for (const [pieceId, assignedRequirements] of requirementsByPiece) {
    const piece = pieceById.get(pieceId);
    if (!piece || piece.materialType !== 'phenolic') continue;

    const packing = packPanelsIntoStock(
      assignedRequirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        length: requirement.length,
        width: requirement.width ?? 0,
      })),
      { length: piece.length, width: piece.width },
    );

    if (packing.placedPanelIds.length === 0) continue;

    allocations.push({
      pieceId,
      plan: packing.plan,
      panelIds: packing.placedPanelIds,
    });
  }

  return allocations.sort((a, b) => {
    const aArea = a.plan.stock.length * a.plan.stock.width;
    const bArea = b.plan.stock.length * b.plan.stock.width;
    return bArea - aArea || a.pieceId.localeCompare(b.pieceId);
  });
}
