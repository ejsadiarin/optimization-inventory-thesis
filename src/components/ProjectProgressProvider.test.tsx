import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { listPieces } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import { getProjectPlan } from '@/db/plan';
import type { StructuralMember } from '@/db/types';
import { makeProject } from '@/test/fixtures';
import { ProjectProgressProvider } from './ProjectProgressProvider';
import { useProjectProgress } from '@/lib/useProjectProgress';

vi.mock('@/db/members', () => ({
  listStructuralMembers: vi.fn(),
  listLumberRequirements: vi.fn(),
}));

vi.mock('@/db/inventory', () => ({
  listPieces: vi.fn(),
}));

vi.mock('@/db/plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/plan')>();
  return { ...actual, getProjectPlan: vi.fn() };
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
  const { counts, nav, notifications } = useProjectProgress();
  const navigate = useNavigate();

  return (
    <div>
      <p data-testid="members-count">{counts.structuralMembers}</p>
      <p data-testid="planner-outstanding">
        {nav.planner?.count ?? (nav.planner?.complete ? 'complete' : 'none')}
      </p>
      <p data-testid="notification-count">{notifications.length}</p>
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
    vi.mocked(listPieces).mockResolvedValue([]);
    vi.mocked(getProjectPlan).mockResolvedValue(null);

    renderProvider();

    expect(
      await screen.findByText('0', { selector: '[data-testid="members-count"]' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to other tab' }));

    await waitFor(() => {
      expect(screen.getByTestId('members-count')).toHaveTextContent('1');
    });
    expect(listStructuralMembers).toHaveBeenCalledTimes(2);
  });

  it('shows invalidation warnings from the reconciled plan', async () => {
    vi.mocked(listStructuralMembers).mockResolvedValue([]);
    vi.mocked(listLumberRequirements).mockResolvedValue([]);
    vi.mocked(listPieces).mockResolvedValue([]);
    vi.mocked(getProjectPlan).mockResolvedValue({
      ...(await import('@/db/plan')).emptyProjectPlan(),
      status: 'needs_review',
      invalidations: [
        {
          id: 'invalidation:retired-piece:board-1',
          message: 'Board 1234 was retired; S1 panel released.',
          requirementIds: ['member-1-panel-1'],
          pieceIds: ['board-1'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
    });
  });
});
