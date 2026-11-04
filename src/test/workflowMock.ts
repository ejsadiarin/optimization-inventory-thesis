import type { OptimizationWorkflow } from '@/db/workflow';

let workflows = new Map<string, OptimizationWorkflow>();

function clone(workflow: OptimizationWorkflow): OptimizationWorkflow {
  return {
    ...workflow,
    satisfiedRequirementIds: [...workflow.satisfiedRequirementIds],
    acceptedByRequirement: { ...workflow.acceptedByRequirement },
    declinedCandidates: [...workflow.declinedCandidates],
    newStockRequirementIds: [...workflow.newStockRequirementIds],
  };
}

export function resetWorkflowMock(): void {
  workflows = new Map<string, OptimizationWorkflow>();
}

export async function getOptimizationWorkflow(
  projectId: string,
): Promise<OptimizationWorkflow | null> {
  const workflow = workflows.get(projectId);
  return workflow ? clone(workflow) : null;
}

export async function saveOptimizationWorkflow(
  projectId: string,
  workflow: OptimizationWorkflow,
): Promise<void> {
  workflows.set(projectId, clone(workflow));
}
