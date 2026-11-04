import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { decidedCount, reviewRequirements } from '@/components/optimize/reuseReview';
import { getActivePieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import { filterCuttingPlanSnapshot, getLatestCuttingPlan } from '@/db/plans';
import type { Project } from '@/db/types';
import {
  emptyWorkflow,
  getOptimizationWorkflow,
  invalidateWorkflow,
  workflowFromSnapshot,
} from '@/db/workflow';
import { toMatchRequirements, toPlywoodPanel } from '@/engine';
import { decomposeMember } from '@/engine/decompose';
import { optimizeLumber } from '@/engine/lumber';
import { matchInventory } from '@/engine/match';
import { optimizePlywood } from '@/engine/plywood';
import {
  buildProjectNotifications,
  type ProjectNotification,
} from '@/lib/projectNotifications';
import {
  buildNavAnnotations,
  buildProjectChecklist,
  type ProjectProgressCounts,
} from '@/lib/projectProgress';
import { ProjectProgressContext } from '@/lib/projectProgressContext';
import { toMatchPiece } from '@/lib/pieces';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

const EMPTY_COUNTS: ProjectProgressCounts = {
  structuralMembers: 0,
  lumberRequirements: 0,
  pieces: 0,
  requirements: 0,
  decidedRequirements: 0,
  reuseReviewed: false,
  cutPlansReviewedAt: null,
};

export function ProjectProgressProvider({
  project,
  children,
}: {
  project: Project;
  children: ReactNode;
}) {
  const refreshSignal = useRefreshSignal();
  const location = useLocation();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: false,
    counts: EMPTY_COUNTS,
    notifications: [] as ProjectNotification[],
  });

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [members, lumber, pieces, storedWorkflow] = await Promise.all([
          listStructuralMembers(project.id),
          listLumberRequirements(project.id),
          getActivePieces(project.id),
          getOptimizationWorkflow(project.id),
        ]);

        const panels = members.flatMap(decomposeMember);
        const requirements = toMatchRequirements(panels, lumber);
        const matchPieces = pieces.map(toMatchPiece);
        const groups = matchInventory(requirements, matchPieces);

        let workflow = storedWorkflow;
        if (!workflow) {
          const latest = await getLatestCuttingPlan(project.id);
          if (latest) {
            workflow = workflowFromSnapshot(
              filterCuttingPlanSnapshot(
                latest.snapshot,
                new Set(requirements.map((requirement) => requirement.id)),
              ),
            );
          }
        }

        const resolved = invalidateWorkflow(
          workflow ?? emptyWorkflow(),
          requirements,
          matchPieces,
        );
        const satisfied = new Set(resolved.satisfiedRequirementIds);
        const plywood = optimizePlywood(
          panels.filter((panel) => !satisfied.has(panel.id)).map(toPlywoodPanel),
          project.stock.phenolic,
        );
        const lumberPlan = optimizeLumber(
          lumber.filter((requirement) => !satisfied.has(requirement.id)),
          project.stock.lumberLengths,
        );
        const notifications = buildProjectNotifications(
          plywood.oversizedPanels,
          lumberPlan.unplacedRequirements,
        );
        const reviews = reviewRequirements(
          groups,
          satisfied,
          new Map(Object.entries(resolved.acceptedByRequirement)),
          new Set(resolved.declinedCandidates),
          new Set(resolved.newStockRequirementIds),
        );

        if (cancelled) return;
        setState({
          loading: false,
          error: false,
          counts: {
            structuralMembers: members.length,
            lumberRequirements: lumber.length,
            pieces: pieces.length,
            requirements: requirements.length,
            decidedRequirements: decidedCount(reviews),
            reuseReviewed: workflow !== null,
            cutPlansReviewedAt: resolved.cutPlansReviewedAt,
          },
          notifications,
        });
      } catch {
        if (cancelled) return;
        setState((current) => ({ ...current, loading: false, error: true }));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.stock, refreshSignal, reloadToken, location.pathname]);

  const checklist = buildProjectChecklist(state.counts);
  const nav = buildNavAnnotations(state.counts);

  return (
    <ProjectProgressContext.Provider
      value={{ ...state, checklist, nav, reload }}
    >
      {children}
    </ProjectProgressContext.Provider>
  );
}
