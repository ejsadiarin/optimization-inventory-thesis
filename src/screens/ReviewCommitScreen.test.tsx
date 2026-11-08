import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { addPiece, getPiece, listPieces, retirePiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { getProjectPlan } from '@/db/plan';
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

async function renderReview(projectId: string) {
  unlockProject(projectId);
  const view = render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/review`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /^review & commit$/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading review/i)).not.toBeInTheDocument();
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

describe('ReviewCommitScreen project scope', () => {
  it('keeps the commit actions in a sticky header above the board grid', async () => {
    const project = await seedProject({ name: 'Sticky Commit Site' });
    await addMember(project.id, 'C1');

    await renderReview(project.id);

    const bar = screen.getByTestId('review-commit-bar');
    expect(bar).toHaveClass('sticky');
    expect(within(bar).getByRole('button', { name: /commit plan/i })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /export all svg/i })).toBeInTheDocument();
  });

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

    await renderReview(project.id);

    expect(screen.getAllByText('C1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project brace').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: /^review & commit$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit plan/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export all svg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export all png/i })).toBeInTheDocument();
    expect(screen.getByText(/^reusable offcuts$/i)).toBeInTheDocument();
  });

  it('shows piece labels and storage locations on reuse candidates', async () => {
    const project = await seedProject({ name: 'Candidate Detail Site' });
    await addMember(project.id, 'C1');
    await addPiece({
      projectId: project.id,
      label: 'Rack panel A',
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });

    await renderReview(project.id);

    expect(await screen.findByText('Rack panel A')).toBeInTheDocument();
    expect(screen.getByText('Storage: Rack A')).toBeInTheDocument();
  });

  it('shows a procurement summary once boards are in the plan', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Procurement Site' });
    await addMember(project.id, 'C1');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderReview(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    const summary = await screen.findByTestId('planner-procurement');
    expect(summary).toHaveTextContent('Boards used');
    expect(summary).toHaveTextContent('Sheets saved');
    expect(summary).toHaveTextContent('Utilization');
    expect(summary).toHaveTextContent('Waste');
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

    await renderReview(project.id);
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

    const view = await renderReview(project.id);
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
    await renderReview(project.id);

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

    await renderReview(project.id);
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

    await renderReview(project.id);
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

    await renderReview(project.id);
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

  it('releases a committed allocation and asks for a decision when its board is retired', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Retired Board Site' });
    const c1 = await addMember(project.id, 'C1');
    const first = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });
    const second = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    const view = await renderReview(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /commit plan/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /commit plan/i }));
    await screen.findByText('Committed');

    const committed = await getProjectPlan(project.id);
    const committedPieceId =
      committed!.committedByRequirement[`${c1.id}-panel-1`]!;
    await retirePiece(project.id, committedPieceId);
    view.unmount();
    await renderReview(project.id);

    await waitFor(async () => {
      const plan = await getProjectPlan(project.id);
      expect(plan).toMatchObject({ status: 'needs_review' });
      expect(plan?.committedByRequirement).toEqual({});
    });
    await screen.findByText(/plan needs review/i);
    expect(screen.getByText(/was retired/i)).toBeInTheDocument();
    await expect(getPiece(project.id, committedPieceId)).resolves.toMatchObject({
      usageCount: 1,
    });
    expect(screen.getByRole('button', { name: /commit plan/i })).toBeDisabled();
    expect([first.id, second.id]).toContain(committedPieceId);
  });

  it('exports a single board and all boards as SVG and PNG', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Export Site' });
    await addMember(project.id, 'C1');
    await addMember(project.id, 'C2');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderReview(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    await screen.findByText(/shares piece · remaining space fits/i);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);

    const board = await screen.findByTestId('planner-reused-boards');
    expect(within(board).getAllByTestId(/planner-board-/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /export .* as svg/i }));
    expect(exportSvgMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /export all svg/i }));
    expect(exportSvgMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: /export .* as png/i }));
    await waitFor(() => expect(exportPngMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /export all png/i }));
    await waitFor(() => expect(exportPngMock).toHaveBeenCalledTimes(2));
  });

  it('returns a reusable offcut to inventory with the stock thickness', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Offcut Site' });
    await addMember(project.id, 'C1');
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
    });

    await renderReview(project.id);
    await user.click(screen.getAllByRole('button', { name: /^accept /i })[0]!);
    const offcuts = await screen.findByTestId('planner-offcuts');

    await user.click(
      within(offcuts).getByRole('checkbox', {
        name: /keep offcut 1 from reused piece/i,
      }),
    );
    await user.click(
      within(offcuts).getByRole('button', { name: /add selected to inventory/i }),
    );

    await waitFor(async () => {
      const pieces = await listPieces(project.id);
      const returned = pieces.find((piece) => piece.source === 'Cut plan offcut');
      expect(returned).toMatchObject({
        materialType: 'phenolic',
        thickness: project.stock.phenolic.thickness,
        condition: 'Good',
        usageCount: 0,
        retired: false,
      });
      expect(returned!.length).toBeGreaterThan(0);
      expect(returned!.width).toBeGreaterThan(0);
    });
    expect(await screen.findByText('Added')).toBeInTheDocument();
  });
});
