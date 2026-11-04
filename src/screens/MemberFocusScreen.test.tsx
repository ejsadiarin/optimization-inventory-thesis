import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
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
    expect(screen.getByTestId(`focus-piece-label-${piece.id}`)).toHaveTextContent(
      'Inventory piece',
    );
    expect(screen.getByTestId(`focus-piece-label-${piece.id}`)).toHaveTextContent(
      '0.90 m × 0.80 m',
    );
    expect(
      screen.getByRole('group', { name: /inventory piece/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId(`focus-piece-legend-${piece.id}`)).toHaveTextContent(
      'S1',
    );

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
    expect(screen.getByTestId('focus-new-stock-label-0')).toHaveTextContent(
      'New stock sheet · 2.44 m × 1.22 m',
    );
    expect(
      screen.getByRole('group', { name: /new stock sheet/i }),
    ).toBeInTheDocument();
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

  it('lets a second panel share a piece and shows its remaining space', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Nesting Site' });
    const beam = await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 2,
      width: 0.2,
      height: 0.4,
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 0.6,
      thickness: 0.018,
    });

    await renderFocus(project.id);

    expect(screen.getByTestId(`member-reuse-${beam.id}`)).toHaveTextContent(
      '3 panels · 2/3 panels reusable',
    );

    await user.click(screen.getByRole('button', { name: /use best matches/i }));

    expect(within(screen.getByTestId('focus-summary')).getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByTestId(`focus-piece-plan-${piece.id}`)).toHaveTextContent(
      /2 panels/,
    );
    expect(
      screen.getAllByText(/remaining space/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByTestId(`focus-remaining-${beam.id}-panel-1`).textContent,
    ).not.toBe(
      screen.getByTestId(`focus-remaining-${beam.id}-panel-2`).textContent,
    );
    expect(screen.getAllByText(/no saw kerf/i).length).toBeGreaterThan(0);

    const thirdPanel = screen.getByTestId(`focus-panel-${beam.id}-panel-3`);
    expect(
      within(thirdPanel).getByRole('option', { name: /2\.44 m × 0\.60 m/i }),
    ).toBeDisabled();
  });

  it('counts only pieces that can be assigned to distinct panels', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Reuse Count Site' });
    const beam = await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 2,
      width: 0.2,
      height: 0.4,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.4,
      width: 0.6,
      thickness: 0.018,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.4,
      width: 0.25,
      thickness: 0.018,
    });

    await renderFocus(project.id);

    expect(screen.getByTestId(`member-reuse-${beam.id}`)).toHaveTextContent(
      '3 panels · 2/3 panels reusable',
    );

    await user.click(screen.getByRole('button', { name: /use best matches/i }));

    expect(within(screen.getByTestId('focus-summary')).getByText('2 of 3')).toBeInTheDocument();
    const thirdPanel = screen.getByTestId(`focus-panel-${beam.id}-panel-3`);
    expect(
      within(thirdPanel).getByText(/all matching pieces are already assigned to other panels/i),
    ).toBeInTheDocument();
  });

  it('auto-applies best matches on load and resets them on member switch', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Auto Site' });
    const first = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    const second = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S2',
      length: 0.5,
      width: 0.5,
      height: 0,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.9,
      width: 0.8,
      thickness: 0.018,
    });

    await renderFocus(project.id);

    expect(
      within(screen.getByTestId('focus-summary')).getByText('1 of 1'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('focus-reuse-diagram')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Inventory piece'), '');
    expect(
      within(screen.getByTestId('focus-summary')).getByText('0 of 1'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId(`member-option-${second.id}`));
    expect(
      within(screen.getByTestId('focus-summary')).getByText('1 of 1'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId(`member-option-${first.id}`));
    expect(
      within(screen.getByTestId('focus-summary')).getByText('1 of 1'),
    ).toBeInTheDocument();
  });

  it('plans only the lumber linked to the selected member', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Lumber Site' });
    const column = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 1.2,
      width: 0.6,
      height: 2.4,
    });
    const beam = await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 2,
      width: 0.2,
      height: 0.4,
    });
    await createLumberRequirement({
      projectId: project.id,
      memberId: column.id,
      label: 'C1 brace',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      memberId: beam.id,
      label: 'B1 brace',
      length: 3,
      crossSection: '2x4',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Project brace',
      length: 1.8,
      crossSection: '2x2',
    });

    await renderFocus(project.id);

    expect(
      screen.getByRole('heading', { name: /lumber for C1/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('focus-lumber-count')).toHaveTextContent('1 linked');

    const columnPlan = screen.getByTestId('focus-lumber-plan');
    expect(within(columnPlan).getByText(/C1 brace/)).toBeInTheDocument();
    expect(within(columnPlan).queryByText(/B1 brace/)).not.toBeInTheDocument();
    expect(within(columnPlan).queryByText(/Project brace/)).not.toBeInTheDocument();
    expect(within(columnPlan).getByText(/2×3 lumber/i)).toBeInTheDocument();
    expect(within(columnPlan).getByTestId('focus-lumber-utilization')).toHaveTextContent(
      /utilization/i,
    );
    expect(within(columnPlan).getByText(/no saw kerf/i)).toBeInTheDocument();

    await user.click(screen.getByTestId(`member-option-${beam.id}`));

    expect(
      await screen.findByRole('heading', { name: /lumber for B1/i }),
    ).toBeInTheDocument();
    const beamPlan = screen.getByTestId('focus-lumber-plan');
    expect(within(beamPlan).getByText(/B1 brace/)).toBeInTheDocument();
    expect(within(beamPlan).queryByText(/C1 brace/)).not.toBeInTheDocument();
  });

  it('shows Exceeds stock with a Settings link instead of New stock when a panel cannot fit', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Oversize Site' });
    const fitting = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    const oversized = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S2',
      length: 4,
      width: 3,
      height: 0,
    });

    await renderFocus(project.id);

    const fittingPanel = screen.getByTestId(`focus-panel-${fitting.id}-panel-1`);
    expect(within(fittingPanel).getByText('New stock')).toBeInTheDocument();
    expect(within(fittingPanel).queryByText('Exceeds stock')).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`member-option-${oversized.id}`));

    const oversizedPanel = await screen.findByTestId(
      `focus-panel-${oversized.id}-panel-1`,
    );
    expect(within(oversizedPanel).getByText('Exceeds stock')).toBeInTheDocument();
    expect(within(oversizedPanel).queryByText('New stock')).not.toBeInTheDocument();
    expect(
      within(oversizedPanel).getByRole('link', { name: /settings/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/settings`);

    const unplaced = screen.getByTestId('focus-unplaced');
    expect(
      within(unplaced).getByRole('link', { name: /review stock sizes/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/settings`);
  });

  it('keeps nested panels on one piece during a background refresh', async () => {
    const project = await seedProject({ name: 'Focus Nested Refresh Site' });
    const beam = await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 2,
      width: 0.2,
      height: 0.4,
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderFocus(project.id);
    expect(
      within(screen.getByTestId('focus-summary')).getByText('3 of 3'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`focus-piece-legend-${piece.id}`)).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(
        within(screen.getByTestId('focus-summary')).getByText('3 of 3'),
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId(`focus-piece-legend-${piece.id}`)).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3);
    expect(screen.getByTestId(`member-option-${beam.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the selected member and manual choices during a background refresh', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Focus Refresh Site' });
    const first = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    const second = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S2',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });

    await renderFocus(project.id);
    expect(screen.getByTestId(`member-option-${first.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByTestId(`member-option-${second.id}`));
    expect(screen.getByTestId(`member-option-${second.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.selectOptions(screen.getByLabelText('Inventory piece'), '');
    expect(
      within(screen.getByTestId('focus-summary')).getByText('0 of 1'),
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(screen.getByTestId(`member-option-${second.id}`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(
      within(screen.getByTestId('focus-summary')).getByText('0 of 1'),
    ).toBeInTheDocument();
  });
});
