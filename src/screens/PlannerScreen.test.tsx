import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

    const viewer = await screen.findByTestId('planner-board-viewer');
    const card = await within(viewer).findByTestId(/^planner-board-(reuse|stock):/);
    expect(
      card.querySelector(`[data-testid="panel-${c1.id}-panel-1"]`),
    ).toHaveAttribute('data-highlighted', 'true');
    expect(
      card.querySelector(`[data-testid="panel-${c2.id}-panel-1"]`),
    ).toHaveAttribute('data-highlighted', 'false');

    await user.click(screen.getByTestId(`planner-member-${c2.id}`));

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
    expect(screen.queryByTestId('planner-offcuts')).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`planner-member-${c2.id}`));
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

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe('PlannerScreen member workspace', () => {
  it('shows per-member progress in the rail and updates it live', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Member Rail Site' });
    const c1 = await addMember(project.id, 'C1');
    const c2 = await addMember(project.id, 'C2');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);

    const rail = screen.getByTestId('planner-member-rail');
    expect(within(rail).getByTestId(`planner-member-${c1.id}`)).toHaveAttribute(
      'aria-label',
      'C1 · 0/1',
    );
    expect(within(rail).getByTestId(`planner-member-${c2.id}`)).toHaveAttribute(
      'aria-label',
      'C2 · 0/1',
    );
    expect(within(rail).getByTestId(`planner-member-${c1.id}`)).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    await waitFor(() => {
      expect(within(rail).getByTestId(`planner-member-${c1.id}`)).toHaveAttribute(
        'aria-label',
        'C1 · 1/1',
      );
    });
    expect(within(rail).getByTestId(`planner-member-${c2.id}`)).toHaveAttribute(
      'aria-label',
      'C2 · 0/1',
    );
  });

  it('filters the rail by member type and status', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Member Filters Site' });
    const slab = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 1,
      width: 1,
      height: 0,
    });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1,
      width: 1,
      height: 0,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);

    await user.selectOptions(
      screen.getByLabelText(/filter by member type/i),
      'column',
    );
    expect(screen.queryByTestId(`planner-member-${slab.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`planner-member-${column.id}`)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/filter by member type/i),
      'all',
    );
    await user.selectOptions(
      screen.getByLabelText(/filter by member status/i),
      'done',
    );
    // The column has no reusable candidates, so its panels already count as
    // new stock decisions while the slab still needs a decision.
    expect(
      screen.queryByTestId(`planner-member-${slab.id}`),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId(`planner-member-${column.id}`)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/filter by member status/i),
      'needs-decision',
    );
    expect(screen.getByTestId(`planner-member-${slab.id}`)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`planner-member-${column.id}`),
    ).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await user.selectOptions(
      screen.getByLabelText(/filter by member status/i),
      'all',
    );
    await waitFor(() => {
      expect(screen.getByTestId(`planner-member-${slab.id}`)).toHaveAttribute(
        'aria-label',
        'S1 · 1/1',
      );
    });
    await user.selectOptions(
      screen.getByLabelText(/filter by member status/i),
      'done',
    );
    expect(screen.getByTestId(`planner-member-${slab.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`planner-member-${column.id}`)).toBeInTheDocument();
  });

  it('lands on the first undecided member and keeps the selection in the URL', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Member Landing Site' });
    const done = await addMember(project.id, 'S1');
    const next = await addMember(project.id, 'S2');
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    await saveProjectPlan(project.id, {
      ...emptyProjectPlan(),
      acceptedByRequirement: { [`${done.id}-panel-1`]: piece.id },
    });
    unlockProject(project.id);

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/planner`]}>
        <TestAuthProvider user={testUser}>
          <App />
          <LocationProbe />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/projects/${project.id}/planner?member=${next.id}`,
      );
    });
    expect(screen.getByTestId(`planner-member-${next.id}`)).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(screen.getByTestId(`planner-member-${done.id}`));

    expect(screen.getByTestId(`planner-member-${done.id}`)).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      `?member=${done.id}`,
    );
  });

  it('renders the member workspace as a full-width three-pane grid', async () => {
    const project = await seedProject({ name: 'Member Layout Site' });
    await addMember(project.id, 'C1');

    await renderPlanner(project.id);

    const workspace = screen.getByTestId('planner-workspace');
    expect(workspace.className).toContain('lg:grid-cols-');
    expect(screen.getByTestId('planner-member-rail')).toBeInTheDocument();
  });
});

describe('PlannerScreen board viewer', () => {
  async function seedColumnBoards(projectId: string, columnId: string) {
    const first = await addPiece({
      projectId,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const second = await addPiece({
      projectId,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const accepted = {
      [`${columnId}-panel-1`]: first.id,
      [`${columnId}-panel-2`]: first.id,
      [`${columnId}-panel-3`]: second.id,
      [`${columnId}-panel-4`]: second.id,
    };
    await saveProjectPlan(projectId, {
      ...emptyProjectPlan(),
      acceptedByRequirement: accepted,
    });
    return accepted;
  }

  it('shows one board at a time with thumbnails, arrows and exports', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Board Viewer Site' });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1,
      width: 1,
      height: 1,
    });
    await seedColumnBoards(project.id, column.id);

    await renderPlanner(project.id);

    const viewer = await screen.findByTestId('planner-board-viewer');
    expect(within(viewer).getAllByTestId(/^planner-board-(reuse|stock):/)).toHaveLength(1);
    expect(viewer).toHaveTextContent('1 of 2');

    const thumbnails = within(viewer).getAllByRole('button', { name: /^show /i });
    expect(thumbnails).toHaveLength(2);

    await user.click(within(viewer).getByRole('button', { name: /next board/i }));
    expect(viewer).toHaveTextContent('2 of 2');

    await user.click(
      within(viewer).getByRole('button', { name: /previous board/i }),
    );
    expect(viewer).toHaveTextContent('1 of 2');

    await user.click(thumbnails[1]!);
    expect(viewer).toHaveTextContent('2 of 2');

    await user.click(
      within(viewer).getByRole('button', { name: /export .* as svg/i }),
    );
    expect(exportSvgMock).toHaveBeenCalledTimes(1);
  });

  it('stays visible while the decision list scrolls', async () => {
    const project = await seedProject({ name: 'Sticky Viewer Site' });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1,
      width: 1,
      height: 1,
    });
    await seedColumnBoards(project.id, column.id);

    await renderPlanner(project.id);

    expect(screen.getByTestId('planner-board-pane')).toHaveClass('lg:sticky');
  });

  it('updates the board as soon as a decision changes the draft', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Live Viewer Site' });
    await addMember(project.id, 'S1');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);

    const viewer = await screen.findByTestId('planner-board-viewer');
    expect(within(viewer).getByText(/^New stock · \d+ panel/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    await waitFor(() => {
      expect(within(viewer).getByText(/^Reused board · \d+ panel/)).toBeInTheDocument();
    });
  });
});

describe('PlannerScreen requirement rows', () => {
  it('renders one row per requirement grouped by status with needs decision first', async () => {
    const project = await seedProject({ name: 'Requirement Rows Site' });
    const slab = await addMember(project.id, 'S1');
    await createLumberRequirement({
      projectId: project.id,
      memberId: slab.id,
      label: 'S1 brace',
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

    const list = await screen.findByTestId('planner-requirement-list');
    expect(within(list).getAllByTestId(/^requirement-row-/)).toHaveLength(2);
    const sections = Array.from(list.querySelectorAll('section')).map((section) =>
      section.getAttribute('aria-label'),
    );
    expect(sections).toEqual(['Needs decision', 'New stock']);
  });

  it('accepts, declines, restores and resets from a row', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Requirement Actions Site' });
    const slab = await addMember(project.id, 'S1');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);

    const rowId = `requirement-row-${slab.id}-panel-1`;
    const row = () => screen.getByTestId(rowId);
    await screen.findByTestId(rowId);
    await user.click(
      within(row()).getByRole('button', {
        name: /^Decline .* for S1$/i,
      }),
    );
    await user.click(
      within(row()).getByRole('button', {
        name: /show other candidates for S1/i,
      }),
    );
    await user.click(
      within(row()).getByRole('button', { name: /^restore .* for S1$/i }),
    );

    await user.click(
      within(row()).getAllByRole('button', { name: /^accept .* for S1$/i })[0]!,
    );
    expect(within(row()).getByText('Satisfied')).toBeInTheDocument();

    await user.click(
      within(row()).getByRole('button', { name: /reset decisions for S1/i }),
    );
    expect(within(row()).getByText('Needs decision')).toBeInTheDocument();
  });

  it('releases a committed decision from its row', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Requirement Release Site' });
    const slab = await addMember(project.id, 'S1');
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const accepted = { [`${slab.id}-panel-1`]: piece.id };
    await saveProjectPlan(project.id, {
      ...emptyProjectPlan(),
      status: 'committed',
      acceptedByRequirement: accepted,
      committedByRequirement: accepted,
      committedAt: new Date().toISOString(),
    });

    await renderPlanner(project.id);

    const row = await screen.findByTestId(`requirement-row-${slab.id}-panel-1`);
    expect(within(row).getByText('Locked')).toBeInTheDocument();
    await user.click(
      within(row).getByRole('button', { name: /release S1/i }),
    );

    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan?.acceptedByRequirement[`${slab.id}-panel-1`]).toBeUndefined();
      expect(plan?.committedByRequirement[`${slab.id}-panel-1`]).toBeUndefined();
    });
  });

  it('renders a 100+ requirement member in an independently scrolling list', async () => {
    const project = await seedProject({ name: 'Large Requirement Site' });
    const slab = await addMember(project.id, 'S1');
    for (let index = 0; index < 105; index += 1) {
      await createLumberRequirement({
        projectId: project.id,
        memberId: slab.id,
        label: `S1 brace ${index + 1}`,
        length: 2,
        crossSection: '2x3',
      });
    }

    await renderPlanner(project.id);

    const list = await screen.findByTestId('planner-requirement-list');
    expect(within(list).getAllByTestId(/^requirement-row-/)).toHaveLength(106);
    expect(list).toHaveClass('lg:overflow-y-auto');
  });
});

describe('Planner routes and navigation', () => {
  it('redirects the legacy optimize route to Review & commit', async () => {
    const project = await seedProject({ name: 'Legacy Route Site' });
    await addMember(project.id, 'C1');
    unlockProject(project.id);

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/optimize`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /^review & commit$/i }),
    ).toBeInTheDocument();
  });

  it('redirects project-scope planner links to Review & commit', async () => {
    const project = await seedProject({ name: 'Project Scope Route Site' });
    await addMember(project.id, 'C1');
    unlockProject(project.id);

    render(
      <MemoryRouter
        initialEntries={[`/projects/${project.id}/planner?scope=project`]}
      >
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
