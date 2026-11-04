import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { createStructuralMember } from '@/db/members';
import { addPiece, listPieces } from '@/db/inventory';
import { seedProject } from '@/test/fixtures';
import { resetMembersMock } from '@/test/membersMock';
import { resetInventoryMock } from '@/test/inventoryMock';

const mocks = vi.hoisted(() => ({
  getOptimizationWorkflow: vi.fn(),
  getLatestCuttingPlan: vi.fn(),
}));

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/members', () => import('@/test/membersMock'));
vi.mock('@/db/inventory', () => import('@/test/inventoryMock'));
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
  resetMembersMock();
  resetInventoryMock();
  mocks.getOptimizationWorkflow.mockReset().mockResolvedValue(null);
  mocks.getLatestCuttingPlan.mockReset().mockResolvedValue(null);
});

async function renderFocus(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/focus`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: /member planner/i });
  await screen.findByText(/choose a member|no structural members yet/i);
}

describe('MemberFocusScreen', () => {
  it('points an empty project at the members screen', async () => {
    const project = await seedProject({ name: 'Empty Focus Site' });

    await renderFocus(project.id);

    expect(screen.getByText(/no structural members yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /add structural members/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/members`);
  });

  it('selects a member and shows only that member’s panels', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Select Site' });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1.2,
      width: 0.6,
      height: 2.4,
    });
    const slab = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });

    await renderFocus(project.id);

    expect(screen.getByTestId(`member-option-${column.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/panel 1 of 4/i)).toBeInTheDocument();

    await user.click(screen.getByTestId(`member-option-${slab.id}`));

    expect(screen.getByTestId(`member-option-${slab.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/panel 1 of 1/i)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('focus-summary')).getByText('0 of 1'),
    ).toBeInTheDocument();
  });

  it('reuses a matching piece without consuming it', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Reuse Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      label: 'Offcut A',
      length: 0.9,
      width: 0.8,
      thickness: 0.018,
    });

    await renderFocus(project.id);
    await user.click(screen.getByRole('button', { name: /use best matches/i }));

    const summary = screen.getByTestId('focus-summary');
    expect(within(summary).getByText('Reused panels')).toBeInTheDocument();
    expect(within(summary).getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByText(/all panels are reused/i)).toBeInTheDocument();
    expect(screen.getByText(/trim to size/i)).toBeInTheDocument();
    expect(screen.getByTestId('focus-reuse-diagram')).toBeInTheDocument();

    const [stored] = await listPieces(project.id);
    expect(stored?.id).toBe(piece.id);
    expect(stored?.usageCount).toBe(0);
  });

  it('plans unassigned panels from new stock and renders the sheet', async () => {
    const project = await seedProject({ name: 'Focus New Stock Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 1,
      width: 0.6,
      height: 0,
    });

    await renderFocus(project.id);

    expect(screen.getByRole('option', { name: /cut from new stock/i })).toBeInTheDocument();
    expect(screen.getByText('New stock')).toBeInTheDocument();
    expect(screen.getByText('Sheet 1')).toBeInTheDocument();
    expect(screen.getByTestId('focus-sheet-0')).toBeInTheDocument();
  });

  it('prevents one physical piece from covering two panels', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Unique Site' });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1.2,
      width: 0.6,
      height: 2.4,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 2.4,
      thickness: 0.018,
    });

    await renderFocus(project.id);
    await user.click(screen.getByRole('button', { name: /use best matches/i }));

    expect(within(screen.getByTestId('focus-summary')).getByText('1 of 4')).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`focus-panel-${column.id}-panel-2`)).getByRole('option', {
        name: /1\.20 m × 2\.40 m/i,
      }),
    ).toBeDisabled();
  });
});
