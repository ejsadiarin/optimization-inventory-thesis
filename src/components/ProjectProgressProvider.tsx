import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getProjectPlan, emptyProjectPlan } from '@/db/plan';
import { listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import type { Project } from '@/db/types';
import { buildPlannerState, reconcileProjectPlan } from '@/lib/planner';
import {
  buildPlanInvalidationNotification,
  buildProjectNotifications,
  type ProjectNotification,
} from '@/lib/projectNotifications';
import {
  buildNavAnnotations,
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
        const [members, lumber, inventoryPieces, storedPlan] = await Promise.all([
          listStructuralMembers(project.id),
          listLumberRequirements(project.id),
          listPieces(project.id),
          getProjectPlan(project.id),
        ]);

        const allPieces = inventoryPieces.map(toMatchPiece);
        const activePieces = allPieces.filter(
          (piece) => !piece.retired && piece.condition !== 'Retired',
        );
        const basePlan = storedPlan ?? emptyProjectPlan();
        const planner = buildPlannerState({
          members,
          lumber,
          pieces: activePieces,
          stock: project.stock,
          costs: project.costs,
          plan: basePlan,
        });
        const { plan: reconciledPlan } = reconcileProjectPlan(
          basePlan,
          planner.requirements,
          allPieces,
        );

        const notifications = buildProjectNotifications(
          planner.optimization.plywood.oversizedPanels,
          planner.optimization.lumber.unplacedRequirements,
        );
        const invalidationNotification = buildPlanInvalidationNotification(
          reconciledPlan.invalidations,
        );
        if (invalidationNotification) {
          notifications.unshift(invalidationNotification);
        }

        if (cancelled) return;
        setState({
          loading: false,
          error: false,
          counts: {
            structuralMembers: members.length,
            lumberRequirements: lumber.length,
            pieces: activePieces.length,
            requirements: planner.requirements.length,
            decidedRequirements: planner.counts.decided,
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
  }, [project.id, project.stock, project.costs, refreshSignal, reloadToken, location.pathname]);

  const nav = buildNavAnnotations(state.counts);

  return (
    <ProjectProgressContext.Provider value={{ ...state, nav, reload }}>
      {children}
    </ProjectProgressContext.Provider>
  );
}
