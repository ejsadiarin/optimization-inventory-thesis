import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { seedProject } from '@/test/fixtures';
import type { LumberRequirement, Piece, StructuralMember } from '@/db/types';

const mocks = vi.hoisted(() => ({
  listStructuralMembers: vi.fn(),
  listLumberRequirements: vi.fn(),
  getActivePieces: vi.fn(),
  getOptimizationWorkflow: vi.fn(),
  getLatestCuttingPlan: vi.fn(),
}));

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/members')>()),
  listStructuralMembers: mocks.listStructuralMembers,
  listLumberRequirements: mocks.listLumberRequirements,
}));
vi.mock('@/db/inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/inventory')>()),
  getActivePieces: mocks.getActivePieces,
}));
vi.mock('@/db/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/workflow')>()),
  getOptimizationWorkflow: mocks.getOptimizationWorkflow,
}));
vi.mock('@/db/plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db/plans')>()),
  getLatestCuttingPlan: mocks.getLatestCuttingPlan,
}));

import { unlockProject } from '@/lib/projectSession';

beforeEach(() => {
  mocks.listStructuralMembers.mockReset().mockResolvedValue([]);
  mocks.listLumberRequirements.mockReset().mockResolvedValue([]);
  mocks.getActivePieces.mockReset().mockResolvedValue([]);
  mocks.getOptimizationWorkflow.mockReset().mockResolvedValue(null);
  mocks.getLatestCuttingPlan.mockReset().mockResolvedValue(null);
});

function renderProject(projectId: string) {
  unlockProject(projectId);
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
}

function member(projectId: string): StructuralMember {
  return {
    id: 'member-1',
    projectId,
    type: 'slab',
    label: 'S1',
    length: 0.6,
    width: 0.6,
    height: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function piece(projectId: string): Piece {
  return {
    id: 'piece-1',
    projectId,
    materialType: 'phenolic',
    length: 0.6,
    width: 0.6,
    thickness: 0.018,
    condition: 'Good',
    usageCount: 0,
    storageLocation: 'Rack A',
    dateAdded: '2026-01-01',
    retired: false,
    source: 'Previous cut offcut',
  };
}

describe('ProjectOverviewScreen', () => {
  it('lands a new project on the checklist with a members action', async () => {
    const project = await seedProject({ name: 'Overview Site' });
    renderProject(project.id);

    expect(await screen.findByRole('heading', { name: 'Overview Site' })).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /start with members/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/members`);

    expect(
      await screen.findByRole('link', { name: /structural members.*define columns/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/members`);
    expect(
      screen.getByRole('link', { name: /reuse decisions.*accept, decline/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize?step=reuse`);
    expect(
      screen.getByRole('link', { name: /cut plans.*review sheet layouts/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize?step=cuts`);
    expect(
      screen.getByRole('link', { name: /summary.*review utilization/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/summary`);
    expect(screen.getAllByText('Optional').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the project sidebar and opens the mobile menu', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Sidebar Site' });
    renderProject(project.id);

    expect(
      await screen.findByRole('navigation', { name: 'Project' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open project menu' }));

    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByRole('link', { name: /members/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}/members`,
    );
    expect(within(menu).getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}/settings`,
    );
  });

  it('shows completion and outstanding work once the project progresses', async () => {
    const project = await seedProject({ name: 'Progress Site' });
    const structuralMember = member(project.id);
    const panelId = `${structuralMember.id}-panel-1`;
    mocks.listStructuralMembers.mockResolvedValue([structuralMember]);
    mocks.getActivePieces.mockResolvedValue([piece(project.id)]);
    mocks.getOptimizationWorkflow.mockResolvedValue({
      satisfiedRequirementIds: [panelId],
      acceptedByRequirement: { [panelId]: 'piece-1' },
      declinedCandidates: [],
      newStockRequirementIds: [],
      step: 'cuts',
      cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
      schemaVersion: 1,
    });

    renderProject(project.id);

    expect(await screen.findByLabelText('Members complete')).toBeInTheDocument();
    expect(screen.getByLabelText('Optimize complete')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /start with members/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /summary.*review utilization/i }),
    ).toBeInTheDocument();
  });

  it('navigates from a checklist row to its screen', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Navigation Site' });
    renderProject(project.id);

    await user.click(
      await screen.findByRole('link', {
        name: /structural members.*define columns/i,
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /structural members/i }),
    ).toBeInTheDocument();
  });

  it('counts outstanding reuse decisions in the Optimize tab', async () => {
    const project = await seedProject({ name: 'Outstanding Site' });
    mocks.listStructuralMembers.mockResolvedValue([member(project.id)]);
    const lumber: LumberRequirement = {
      id: 'lumber-1',
      projectId: project.id,
      label: 'Brace',
      length: 2,
      crossSection: '2x3',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    mocks.listLumberRequirements.mockResolvedValue([lumber]);
    mocks.getActivePieces.mockResolvedValue([
      piece(project.id),
      {
        ...piece(project.id),
        id: 'piece-2',
        materialType: 'lumber',
        length: 3,
        width: 0,
        crossSection: '2x3',
      },
    ]);

    renderProject(project.id);

    expect(await screen.findByLabelText('Members complete')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /optimize.*2 outstanding/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /review reuse decisions/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize?step=reuse`);
  });
});
