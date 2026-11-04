import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { getActivePieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import { filterCuttingPlanSnapshot, getLatestCuttingPlan } from '@/db/plans';
import { getOptimizationWorkflow } from '@/db/workflow';
import type { StructuralMember } from '@/db/types';
import { makeProject } from '@/test/fixtures';
import { ProjectProgressProvider } from './ProjectProgressProvider';
import { useProjectProgress } from '@/lib/useProjectProgress';

vi.mock('@/db/members', () => ({
  listStructuralMembers: vi.fn(),
  listLumberRequirements: vi.fn(),
}));

vi.mock('@/db/inventory', () => ({
  getActivePieces: vi.fn(),
}));

vi.mock('@/db/plans', () => ({
  filterCuttingPlanSnapshot: vi.fn(),
  getLatestCuttingPlan: vi.fn(),
}));

vi.mock('@/db/workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/workflow')>();
  return { ...actual, getOptimizationWorkflow: vi.fn() };
});

const project = makeProject();

const member: StructuralMember = {
  id: 'member-1',
  projectId: project.id,
  type: 'slab',
  label: 'S1',
  length: 2,
  width: 1,
  height: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function Probe() {
  const { counts, checklist } = useProjectProgress();
  const navigate = useNavigate();
  const members = checklist.find((item) => item.id === 'members');

  return (
    <div>
      <p data-testid="members-count">{counts.structuralMembers}</p>
      <p data-testid="members-complete">{String(members?.complete)}</p>
      <button type="button" onClick={() => navigate('/other')}>
        Go to other tab
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={['/one']}>
      <Routes>
        <Route
          element={
            <ProjectProgressProvider project={project}>
              <Outlet />
            </ProjectProgressProvider>
          }
        >
          <Route path="/one" element={<Probe />} />
          <Route path="/other" element={<Probe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProjectProgressProvider', () => {
  it('refreshes progress when the active project tab changes', async () => {
    const user = userEvent.setup();
    vi.mocked(listStructuralMembers)
      .mockResolvedValueOnce([])
      .mockResolvedValue([member]);
    vi.mocked(listLumberRequirements).mockResolvedValue([]);
    vi.mocked(getActivePieces).mockResolvedValue([]);
    vi.mocked(getOptimizationWorkflow).mockResolvedValue(null);
    vi.mocked(getLatestCuttingPlan).mockResolvedValue(null);
    vi.mocked(filterCuttingPlanSnapshot).mockImplementation((snapshot) => snapshot);

    renderProvider();

    expect(await screen.findByText('0', { selector: '[data-testid="members-count"]' })).toBeInTheDocument();
    expect(screen.getByTestId('members-complete')).toHaveTextContent('false');

    await user.click(screen.getByRole('button', { name: 'Go to other tab' }));

    await waitFor(() => {
      expect(screen.getByTestId('members-count')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('members-complete')).toHaveTextContent('true');
    expect(listStructuralMembers).toHaveBeenCalledTimes(2);
  });
});
