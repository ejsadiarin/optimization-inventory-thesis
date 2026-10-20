import { optimizeLumber } from './lumber';
import { matchInventory } from './match';
import { optimizePlywood } from './plywood';
import { calculateStats } from './stats';
import type {
  LumberPlan,
  MatchGroup,
  MatchRequirement,
  OptimizeInput,
  OptimizationResult,
  PanelRequirement,
  PlywoodPanel,
  PlywoodPlan,
} from './types';

function toMatchRequirements(
  panels: readonly PanelRequirement[],
  lumberRequirements: OptimizeInput['lumberRequirements'],
): MatchRequirement[] {
  return [
    ...panels.map((panel) => ({
      id: panel.id,
      materialType: 'phenolic' as const,
      label: panel.label,
      length: panel.length,
      width: panel.width,
    })),
    ...lumberRequirements.map((requirement) => ({
      id: requirement.id,
      materialType: 'lumber' as const,
      label: requirement.label,
      length: requirement.length,
      crossSection: requirement.crossSection,
    })),
  ];
}

function toPlywoodPanel(panel: PanelRequirement): PlywoodPanel {
  return {
    id: panel.id,
    label: panel.label,
    sourceMemberLabel: panel.sourceMemberLabel,
    length: panel.length,
    width: panel.width,
  };
}

/**
 * Single orchestration entry point for the optimization engine. Composes
 * inventory matching with 2D plywood and 1D lumber cutting optimization and
 * reports the combined stats. Pure: no React or Dexie dependencies.
 */
export function optimizeProject(input: OptimizeInput): OptimizationResult {
  const satisfied = input.satisfiedRequirementIds ?? new Set<string>();

  const matches: MatchGroup[] = matchInventory(
    toMatchRequirements(input.panels, input.lumberRequirements),
    input.pieces,
  );

  const remainingPanels = input.panels.filter((panel) => !satisfied.has(panel.id));
  const remainingLumberRequirements = input.lumberRequirements.filter(
    (requirement) => !satisfied.has(requirement.id),
  );

  const plywood: PlywoodPlan = optimizePlywood(
    remainingPanels.map(toPlywoodPanel),
    input.stock.phenolic,
  );
  const lumber: LumberPlan = optimizeLumber(
    remainingLumberRequirements,
    input.stock.lumberLengths,
  );
  const stats = calculateStats(plywood, lumber, input.costs);

  return {
    matches,
    remainingPanels,
    remainingLumberRequirements,
    plywood,
    lumber,
    stats,
  };
}
