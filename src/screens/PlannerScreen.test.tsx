import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { addPiece, getPiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { emptyProjectPlan, getProjectPlan, saveProjectPlan } from '@/db/plan';
import { seedProject } from '@/test/fixtures';
import { resetInventoryMock } from '@/test/inventoryMock';
import { resetMembersMock } from '@/test/membersMock';
import { resetPlanMock } from '@/test/planMock';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/members', () => import('@/test/membersMock'));
vi.mock('@/db/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/inventory')>();
  const mock = await import('@/test/inventoryMock');
  return { ...actual, ...mock };
});
vi.mock('@/db/plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/plan')>();
  const mock = await import('@/test/planMock');
  return { ...actual, ...mock };
});
vi.mock('@/lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/download')>();
  return {
    ...actual,
    downloadSvgAsFile: vi.fn(),
    downloadSvgAsPng: vi.fn().mockResolvedValue(undefined),
  };
});
import { unlockProject } from '@/lib/projectSession';
import { downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';

const exportSvgMock = vi.mocked(downloadSvgAsFile);
const exportPngMock = vi.mocked(downloadSvgAsPng);

beforeEach(() => {
  resetMembersMock();
  resetInventoryMock();
  resetPlanMock();
  exportSvgMock.mockReset();
  exportPngMock.mockReset();
  exportPngMock.mockResolvedValue(undefined);
});

async function renderPlanner(projectId: string, path = '') {
  unlockProject(projectId);
  const view = render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/planner${path}`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /^planner$/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading planner/i)).not.toBeInTheDocument();
  });
  return view;
}

async function addMember(
  projectId: string,
  label: string,
  length = 1,
  width = 1,
) {
  return createStructuralMember({
    projectId,
    type: 'slab',
    label,
    length,
    width,
    height: 0,
  });
}

describe('PlannerScreen member scope', () => {
  it('shows a shared board under each member with only that member highlighted', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Member Projection Site' });
    const c1 = await addMember(project.id, 'C1');
    const c2 = await addMember(project.id, 'C2');
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const accepted = {
      [`${c1.id}-panel-1`]: piece.id,
      [`${c2.id}-panel-1`]: piece.id,
    };
    await saveProjectPlan(project.id, {
      ...emptyProjectPlan(),
      acceptedByRequirement: accepted,
    });

    await renderPlanner(project.id);

    const board = await screen.findByTestId('planner-reused-boards');
    const card = within(board).getAllByTestId(/planner-board-/)[0]!;
    expect(
      card.querySelector(`[data-testid="panel-${c1.id}-panel-1"]`),
    ).toHaveAttribute('data-highlighted', 'true');
    expect(
      card.querySelector(`[data-testid="panel-${c2.id}-panel-1"]`),
    ).toHaveAttribute('data-highlighted', 'false');

    await user.selectOptions(
      screen.getByLabelText(/structural member/i),
      c2.id,
    );

    await waitFor(() => {
      expect(
        card.querySelector(`[data-testid="panel-${c2.id}-panel-1"]`),
      ).toHaveAttribute('data-highlighted', 'true');
    });
    expect(
      card.querySelector(`[data-testid="panel-${c1.id}-panel-1"]`),
    ).toHaveAttribute('data-highlighted', 'false');
    expect((await getProjectPlan(project.id))!.acceptedByRequirement).toEqual(
      accepted,
    );
  });

  it('filters project lumber and keeps global candidate availability in member scope', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Member Filter Site' });
    const c1 = await addMember(project.id, 'C1');
    const c2 = await addMember(project.id, 'C2');
    await createLumberRequirement({
      projectId: project.id,
      memberId: c1.id,
      label: 'C1 brace',
      length: 2,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Project brace',
      length: 2,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    expect(screen.getByText('C1 brace')).toBeInTheDocument();
    expect(screen.queryByText('Project brace')).not.toBeInTheDocument();
    expect(screen.getByTestId('planner-member-coverage')).toHaveTextContent(
      /1 reused · 0 new stock · 0 unplaced/i,
    );
    expect(screen.getByTestId('planner-member-boards')).toHaveTextContent('1 board');
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('planner-offcuts')).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/structural member/i),
      c2.id,
    );
    expect(
      await screen.findByText(/shares piece · remaining space fits/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('C1 brace')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan?.acceptedByRequirement[`${c2.id}-panel-1`]).toBeDefined();
    });
    await expect(getPiece(project.id, Object.values(
      (await getProjectPlan(project.id))!.acceptedByRequirement,
    )[0]!)).resolves.toMatchObject({ usageCount: 0 });
  });

  it('confirms and releases draft shared assignments when making a member exclusive', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Exclusive Draft Site' });
    const c1 = await addMember(project.id, 'C1');
    const c2 = await addMember(project.id, 'C2');
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    await saveProjectPlan(project.id, {
      ...emptyProjectPlan(),
      acceptedByRequirement: {
        [`${c1.id}-panel-1`]: piece.id,
        [`${c2.id}-panel-1`]: piece.id,
      },
    });

    await renderPlanner(project.id);

    const toggle = screen.getByRole('switch', {
      name: /exclusive member plan/i,
    });
    await user.click(toggle);
    const confirm = await screen.findByTestId('planner-exclusive-confirm');
    expect(confirm).toHaveTextContent(/shares 1 draft board/i);
    await user.click(
      within(confirm).getByRole('button', { name: /make exclusive/i }),
    );

    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan?.exclusiveMemberIds).toEqual([c1.id]);
      expect(plan?.acceptedByRequirement[`${c1.id}-panel-1`]).toBeUndefined();
      expect(plan?.acceptedByRequirement[`${c2.id}-panel-1`]).toBeDefined();
    });
    expect(await screen.findByTestId('planner-exclusive-reason')).toHaveTextContent(
      /1 shared board candidate is excluded/i,
    );
    expect(screen.getByTestId('planner-member-coverage')).toHaveTextContent(
      /0 reused · 1 new stock/i,
    );

    await user.click(toggle);
    expect(
      await screen.findByText(/shares piece · remaining space fits/i),
    ).toBeInTheDocument();
    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan?.exclusiveMemberIds).toEqual([]);
    });
  });

  it('requires releasing committed shared allocations before exclusivity', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Exclusive Locked Site' });
    const c1 = await addMember(project.id, 'C1');
    const c2 = await addMember(project.id, 'C2');
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const accepted = {
      [`${c1.id}-panel-1`]: piece.id,
      [`${c2.id}-panel-1`]: piece.id,
    };
    await saveProjectPlan(project.id, {
      ...emptyProjectPlan(),
      status: 'committed',
      acceptedByRequirement: accepted,
      committedByRequirement: accepted,
      committedAt: new Date().toISOString(),
    });

    await renderPlanner(project.id);

    const toggle = screen.getByRole('switch', {
      name: /exclusive member plan/i,
    });
    await user.click(toggle);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /committed shared allocation/i,
    );
    expect(toggle).not.toBeChecked();
    const plan = await getProjectPlan(project.id);
    expect(plan?.exclusiveMemberIds).toEqual([]);
    expect(Object.keys(plan?.committedByRequirement ?? {})).toHaveLength(2);
  });
});

describe('Planner routes and navigation', () => {
  it('redirects legacy optimize and project scope links to Review & commit', async () => {
    const project = await seedProject({ name: 'Legacy Route Site' });
    await addMember(project.id, 'C1');
    unlockProject(project.id);

    const optimize = render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/optimize`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /^review & commit$/i }),
    ).toBeInTheDocument();
    optimize.unmount();

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/planner?scope=project`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /^review & commit$/i }),
    ).toBeInTheDocument();
  });

  it('sends legacy focus links to the member workspace', async () => {
    const project = await seedProject({ name: 'Focus Route Site' });
    await addMember(project.id, 'C1');
    unlockProject(project.id);

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/focus`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /^planner$/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('switch', { name: /exclusive member plan/i }),
    ).toBeInTheDocument();
  });

  it('uses Planner as the landing route and active navigation item', async () => {
    const project = await seedProject({ name: 'Landing Site' });
    await addMember(project.id, 'C1');
    unlockProject(project.id);

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /^planner$/i }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /^project$/i });
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
    expect(within(nav).getByRole('link', { name: /^planner/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: /^review & commit/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/review`);
  });
});
