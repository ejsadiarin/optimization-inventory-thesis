import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { addPiece, getPiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { getProjectPlan } from '@/db/plan';
import { seedProject } from '@/test/fixtures';
import { resetInventoryMock } from '@/test/inventoryMock';
import { resetMembersMock } from '@/test/membersMock';
import { resetPlanMock } from '@/test/planMock';
import { resetWorkflowMock } from '@/test/workflowMock';

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
vi.mock('@/db/plans', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/plans')>();
  const mock = await import('@/test/plansMock');
  return { ...actual, ...mock };
});
vi.mock('@/db/workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/workflow')>();
  const mock = await import('@/test/workflowMock');
  return { ...actual, ...mock };
});
import { unlockProject } from '@/lib/projectSession';

beforeEach(() => {
  resetMembersMock();
  resetInventoryMock();
  resetPlanMock();
  resetWorkflowMock();
});

async function renderPlanner(projectId: string) {
  unlockProject(projectId);
  const view = render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/planner`]}>
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

describe('PlannerScreen project scope', () => {
  it('lists every member requirement and project-level lumber', async () => {
    const project = await seedProject({ name: 'Planner Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    await createLumberRequirement({
      projectId: project.id,
      label: 'Project brace',
      length: 2,
      crossSection: '2x3',
    });

    await renderPlanner(project.id);

    expect(screen.getAllByText('C1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project brace').length).toBeGreaterThan(0);
    expect(screen.getByText(/project scope/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit plan/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /offcut/i })).not.toBeInTheDocument();
  });

  it('shows a shared-space hint when a board fits another member panel', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Shared Hint Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);
    expect(screen.queryByText(/shares piece · remaining space fits/i)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    expect(
      await screen.findByText(/shares piece · remaining space fits/i),
    ).toBeInTheDocument();
  });

  it('persists accepted and declined draft decisions across reload without usage', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Draft Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    const first = await addPiece({
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

    const view = await renderPlanner(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await screen.findByText(/excluded from cutting/i);
    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(Object.keys(plan?.acceptedByRequirement ?? {})).toHaveLength(1);
    });
    await expect(getPiece(project.id, first.id)).resolves.toMatchObject({
      usageCount: 0,
    });

    await user.click(screen.getAllByRole('button', { name: /^decline /i })[0]!);
    await screen.findByText(/show declined \(1\)/i);

    view.unmount();
    await renderPlanner(project.id);

    expect(screen.getByText(/excluded from cutting/i)).toBeInTheDocument();
    expect(screen.getByText(/show declined \(1\)/i)).toBeInTheDocument();
    await expect(getPiece(project.id, first.id)).resolves.toMatchObject({
      usageCount: 0,
    });
  });

  it('renders a shared board once with panels from both members', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Shared Board Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await screen.findByText(/shares piece · remaining space fits/i);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    const reused = await screen.findByTestId('planner-reused-boards');
    expect(within(reused).getAllByTestId(/planner-board-/)).toHaveLength(1);
    expect(reused).toHaveTextContent('C1');
    expect(reused).toHaveTextContent('C2');
  });

  it('keeps commit disabled until every requirement is decided', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Commit Gate Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
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
    const commit = screen.getByRole('button', { name: /commit plan/i });
    expect(commit).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    expect(screen.getByRole('button', { name: /commit plan/i })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /commit plan/i })).toBeEnabled();
    });
  });

  it('commits usage once, locks allocations, and releases without reverting history', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Commit Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    const first = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 1.2,
      thickness: 0.018,
    });
    const second = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderPlanner(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /commit plan/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /commit plan/i }));
    await screen.findByText('Committed');
    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan).toMatchObject({ status: 'committed' });
      expect(Object.keys(plan?.committedByRequirement ?? {})).toHaveLength(2);
    });
    await expect(getPiece(project.id, first.id)).resolves.toMatchObject({ usageCount: 1 });
    await expect(getPiece(project.id, second.id)).resolves.toMatchObject({ usageCount: 1 });
    expect(screen.getAllByText(/^locked$/i)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /re-commit plan/i }));
    await waitFor(async () => {
      await expect(getPiece(project.id, first.id)).resolves.toMatchObject({ usageCount: 1 });
      await expect(getPiece(project.id, second.id)).resolves.toMatchObject({ usageCount: 1 });
    });

    await user.click(screen.getByRole('button', { name: /release c1/i }));
    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(Object.keys(plan?.committedByRequirement ?? {})).toHaveLength(1);
    });
    await expect(getPiece(project.id, first.id)).resolves.toMatchObject({ usageCount: 1 });
    expect(screen.getByRole('button', { name: /commit plan/i })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /commit plan/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /commit plan/i }));
    await waitFor(async () => {
      await expect(getPiece(project.id, first.id)).resolves.toMatchObject({ usageCount: 2 });
    });
  });
});
