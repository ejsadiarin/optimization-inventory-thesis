import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { addPiece, getPiece, getUsageLog, listPieces, recordUsage, retirePiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember, deleteStructuralMember } from '@/db/members';
import * as membersDb from '@/db/members';
import { saveCuttingPlanSnapshot } from '@/db/plans';
import { shortId } from '@/lib/format';
import {
  getOptimizationWorkflow,
} from '@/db/workflow';
import { seedProject } from '@/test/fixtures';
import { resetInventoryMock } from '@/test/inventoryMock';
import { resetMembersMock } from '@/test/membersMock';
import { resetPlansMock } from '@/test/plansMock';
import { resetWorkflowMock } from '@/test/workflowMock';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/members', () => import('@/test/membersMock'));
vi.mock('@/db/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/inventory')>();
  const mock = await import('@/test/inventoryMock');
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

beforeEach(async () => {
  resetMembersMock();
  resetInventoryMock();
  resetPlansMock();
  resetWorkflowMock();
});

async function renderOptimize(projectId: string, search = '') {
  unlockProject(projectId);
  const view = render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/optimize${search}`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /optimization/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading matches/i)).not.toBeInTheDocument();
  });
  return view;
}

async function openCutsStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^plan cuts/i }));
}

describe('OptimizationScreen matching', () => {
  it('renders decomposed member panels as match requirements', async () => {
    const project = await seedProject({ name: 'Optimize Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.5,
      width: 0.3,
      height: 3,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.5,
      width: 3,
      thickness: 0.018,
    });

    await renderOptimize(project.id);

    expect(screen.getAllByText('C1').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/panel 1 of 4/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.50 m × 3\.00 m/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.30 m × 3\.00 m/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/requires cutting/i).length).toBeGreaterThan(0);
  });

  it('accepts a match, increments usage, logs the member, and satisfies the requirement', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Optimize Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
      storageLocation: 'Rack C',
    });

    await renderOptimize(project.id);
    expect(screen.getAllByText('Brace A').length).toBeGreaterThan(0);
    expect(screen.getByText(/usage 0/i)).toBeInTheDocument();
    expect(screen.getByText(/requires cutting/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    expect(screen.getByText(/usage 1/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${shortId(piece.id)} · usage 1`, 'i')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/all requirements covered by reusable inventory/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept /i })).not.toBeInTheDocument();

    const log = await getUsageLog(project.id, piece.id);
    expect(log).toHaveLength(1);
    expect(log[0]!.structuralMemberLabel).toBe('Brace A');
    await expect(getPiece(project.id, piece.id)).resolves.toMatchObject({ usageCount: 1, condition: 'Good' });
  });

  it('flags a piece for inspection when acceptance is its fifth use', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Optimize Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 2.4,
      crossSection: '2x3',
    });
    for (let use = 1; use <= 4; use += 1) {
      await recordUsage(piece.id, project.id, `B${use}`);
    }

    await renderOptimize(project.id);
    expect(screen.getByText(/inspection after this use/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    expect(screen.getByText(/usage 5/i)).toBeInTheDocument();
    expect(screen.getByText(/flagged for inspection after this use/i)).toBeInTheDocument();
    await expect(getPiece(project.id, piece.id)).resolves.toMatchObject({
      usageCount: 5,
      condition: 'For Inspection',
    });
  });

  it('restores accepted matches after unmount and remount', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Persisted Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    const first = await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    first.unmount();

    await renderOptimize(project.id);

    expect(
      screen.getByText(/all requirements covered by reusable inventory/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept /i })).not.toBeInTheDocument();
    await expect(getUsageLog(project.id, piece.id)).resolves.toHaveLength(1);
  });

  it('prevents one physical piece from satisfying a second requirement', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'One Piece Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace B',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 4.8,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    expect(screen.getAllByRole('button', { name: /accept/i })).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: /accept/i })[0]!);

    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /no match \(1\)/i }));
    expect(screen.getByText(/all matching pieces are assigned to other requirements/i)).toBeInTheDocument();
    expect(
      screen.getByText(/1 matching piece assigned to other requirements/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept /i })).not.toBeInTheDocument();
    await expect(getUsageLog(project.id, piece.id)).resolves.toHaveLength(1);
  });

  it('declines a candidate without consuming it or satisfying the requirement', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Optimize Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /decline/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /no match \(1\)/i }));
    expect(screen.getByText(/all matching pieces have been declined/i)).toBeInTheDocument();
    expect(screen.queryByText('Satisfied')).not.toBeInTheDocument();
    await expect(getUsageLog(project.id, piece.id)).resolves.toHaveLength(0);
    await expect(getPiece(project.id, piece.id)).resolves.toMatchObject({ usageCount: 0 });
  });
});

describe('OptimizationScreen workflow persistence', () => {
  it('persists a decline for one requirement without hiding the piece for another', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Decline Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace B',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    const first = await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /decline .* for brace a/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /accept .* for brace a/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /accept .* for brace b/i })).toBeInTheDocument();
    first.unmount();

    await renderOptimize(project.id);

    expect(
      screen.queryByRole('button', { name: /accept .* for brace a/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept .* for brace b/i })).toBeInTheDocument();
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      declinedCandidates: [expect.stringMatching(/::/)],
    });
  });

  it('persists plan-from-new-stock without declining its candidates', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'New Stock Site' });
    const requirement = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    const first = await renderOptimize(project.id);
    await user.click(
      screen.getByRole('button', { name: /plan brace a from new stock/i }),
    );

    expect(
      await screen.findByRole('button', { name: /new stock \(1\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no requirements in needs decision/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continue to plan cuts/i }),
    ).toBeInTheDocument();
    first.unmount();

    await renderOptimize(project.id);

    expect(screen.getByRole('button', { name: /new stock \(1\)/i })).toBeInTheDocument();
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      newStockRequirementIds: [requirement.id],
      declinedCandidates: [],
    });

    await user.click(screen.getByRole('button', { name: /reset decisions/i }));

    expect(
      await screen.findByRole('button', { name: /accept .* for brace a/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no requirements in needs decision/i)).not.toBeInTheDocument();
  });

  it('resets declines and new-stock marks without clearing accepted matches', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Reset Site' });
    const acceptedRequirement = await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace B',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await user.click(
      screen.getAllByRole('button', { name: /accept .* for brace a/i })[0]!,
    );
    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    await user.click(
      screen.getAllByRole('button', { name: /decline .* for brace b/i })[0]!,
    );

    await user.click(screen.getByRole('button', { name: /reset decisions/i }));

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /accept .* for brace b/i }).length,
      ).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: /satisfied \(1\)/i }));
    expect(screen.getByText(/excluded from cutting/i)).toBeInTheDocument();
    const storedWorkflow = await getOptimizationWorkflow(project.id);
    const acceptedPieceId = storedWorkflow?.acceptedByRequirement[acceptedRequirement.id];
    expect(acceptedPieceId).toBeDefined();
    await expect(getUsageLog(project.id, acceptedPieceId!)).resolves.toHaveLength(1);
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      satisfiedRequirementIds: [acceptedRequirement.id],
      declinedCandidates: [],
      newStockRequirementIds: [],
    });
  });

  it('clears a stale accepted match on load but keeps the usage entry', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Stale Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    const first = await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(await screen.findByText(/accepted brace a/i)).toBeInTheDocument();
    first.unmount();

    await retirePiece(project.id, piece.id);
    await renderOptimize(project.id);

    expect(screen.queryByText(/excluded from cutting/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no inventory pieces yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add inventory/i })).toBeInTheDocument();
    await expect(getUsageLog(project.id, piece.id)).resolves.toHaveLength(1);
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('clears an accepted match when its requirement no longer exists', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Deleted Requirement Site' });
    const member = await createStructuralMember({
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
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });

    const first = await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(await screen.findByText(/accepted s1/i)).toBeInTheDocument();
    first.unmount();

    await deleteStructuralMember(project.id, member.id);
    await renderOptimize(project.id);

    expect(screen.getByText(/no formwork requirements yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /add structural members/i }),
    ).toBeInTheDocument();
    await expect(getUsageLog(project.id, piece.id)).resolves.toHaveLength(1);
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });
  });

  it('resumes the last step and lets an explicit URL step win', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Resume Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });

    const first = await renderOptimize(project.id);
    await openCutsStep(user);
    expect(screen.getByRole('heading', { name: /cutting plans/i })).toBeInTheDocument();
    first.unmount();

    const second = await renderOptimize(project.id);
    expect(screen.getByRole('heading', { name: /cutting plans/i })).toBeInTheDocument();
    second.unmount();

    await renderOptimize(project.id, '?step=reuse');

    expect(screen.getByRole('button', { name: /reuse inventory/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByRole('heading', { name: /cutting plans/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no inventory pieces yet/i)).toBeInTheDocument();
  });

  it('deep-links to the cuts step', async () => {
    const project = await seedProject({ name: 'Deep Link Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });

    await renderOptimize(project.id, '?step=cuts');

    expect(screen.getByRole('button', { name: /plan cuts/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('heading', { name: /cutting plans/i })).toBeInTheDocument();
  });

  it('derives satisfied requirements from the latest cutting plan without a workflow', async () => {
    const project = await seedProject({ name: 'Snapshot Fallback Site' });
    const member = await createStructuralMember({
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
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });
    const panelId = `${member.id}-panel-1`;
    await saveCuttingPlanSnapshot(project.id, {
      satisfiedRequirementIds: [panelId],
      acceptedByRequirement: { [panelId]: piece.id },
    });

    await renderOptimize(project.id);

    expect(screen.getByRole('button', { name: /reuse inventory/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(
      screen.getByText(/all requirements covered by reusable inventory/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continue to plan cuts/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    await expect(getOptimizationWorkflow(project.id)).resolves.toBeNull();
  });

  it('shows an error state and retries a failed load', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Retry Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });
    vi.spyOn(membersDb, 'listStructuralMembers').mockRejectedValueOnce(
      new Error('offline'),
    );

    await renderOptimize(project.id);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load optimization data/i);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('button', { name: /accept/i })).toBeInTheDocument();
  });
});

describe('OptimizationScreen cutting plans', () => {
  it('renders plywood SVG plans and grouped lumber cuts for remaining requirements', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Plan Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Long Brace',
      length: 7,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.getByRole('heading', { name: /cutting plans/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sheets \(1\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('cut-plan-sheet-0')).toBeInTheDocument();
    expect(screen.getByText('0.60 × 0.60 m')).toBeInTheDocument();
    expect(screen.getAllByText('S1').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /lumber \(1\)/i }));
    expect(screen.getByRole('tab', { name: /lumber \(1\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();
    expect(screen.getByText(/2×3 lumber/i)).toBeInTheDocument();
    expect(screen.getByText(/stock 1 · 2\.40 m/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Brace A/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/estimated savings/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('cut-utilization')).toHaveTextContent(/%/);

    await user.click(screen.getByRole('button', { name: /notifications \(1\)/i }));
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(/1 lumber requirement exceeds the stock lengths/i),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('link', { name: /review 1 lumber requirement/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize?step=cuts`);
  });

  it('recomputes plans and shows the no-cuts state after accepting a reuse match', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Replan Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
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

    await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /accept/i }));
    await openCutsStep(user);

    expect(await screen.findByText(/no cuts needed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/all requirements are satisfied by reused pieces/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /sheets/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();
  });

  it('adds selected reusable offcuts to inventory as Good pieces with zero uses', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Offcut Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 2.14,
      width: 0.92,
      height: 0,
    });

    await renderOptimize(project.id);
    await openCutsStep(user);
    const summaryBefore = screen.getByTestId('cut-summary').textContent;
    await user.click(screen.getByRole('tab', { name: /offcuts \(2\)/i }));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(screen.getByTestId('offcut-completion')).toHaveTextContent('0 offcuts returned');
    const addButton = screen.getByRole('button', { name: /add selected to inventory/i });
    expect(addButton).toBeDisabled();

    await user.click(checkboxes[0]!);
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    expect(
      await screen.findByText(/returned 1 offcut to inventory/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('offcut-completion')).toHaveTextContent('1 offcut returned');
    expect(
      screen.getByText(/available in the next optimization session/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('cut-summary').textContent).toBe(summaryBefore);

    const pieces = await listPieces(project.id);
    const added = pieces.filter((piece) => piece.source === 'Cut plan offcut');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      materialType: 'phenolic',
      condition: 'Good',
      usageCount: 0,
      thickness: 0.018,
      storageLocation: '',
      source: 'Cut plan offcut',
    });
    expect(added[0]!.length).toBeCloseTo(0.3);
    expect(added[0]!.width).toBeCloseTo(0.92);
    expect(Date.now() - Date.parse(added[0]!.dateAdded)).toBeLessThan(60_000);

    expect(screen.getByRole('checkbox', { name: /offcut 1 from sheet 1/i })).toBeDisabled();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(addButton).toBeDisabled();
  });

  it('creates returned offcuts with an overridden project stock thickness', async () => {
    const user = userEvent.setup();
    const project = await seedProject({
      name: 'Thick Offcut Site',
      stock: { phenolic: { length: 2.44, width: 1.22, thickness: 0.02 } },
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 2.14,
      width: 0.92,
      height: 0,
    });

    await renderOptimize(project.id);
    await openCutsStep(user);
    await user.click(screen.getByRole('tab', { name: /offcuts \(2\)/i }));
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getByRole('button', { name: /add selected to inventory/i }));

    expect(
      await screen.findByText(/returned 1 offcut to inventory/i),
    ).toBeInTheDocument();
    const pieces = await listPieces(project.id);
    expect(pieces.find((piece) => piece.source === 'Cut plan offcut')?.thickness).toBe(0.02);
  });

  it('shows summary stats and keeps accurate segment counts', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Segments Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 2.14,
      width: 0.92,
      height: 0,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.getByTestId('cut-summary')).toHaveTextContent(/sheets used/i);
    expect(screen.getByTestId('cut-summary')).not.toHaveTextContent(/savings/i);
    expect(screen.getByTestId('cut-utilization')).toHaveTextContent(/%/);

    expect(screen.getByRole('tab', { name: /sheets \(1\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /lumber \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /offcuts \(2\)/i })).toBeInTheDocument();
    expect(screen.getByTestId('cut-plan-sheet-0')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /lumber \(1\)/i }));
    expect(screen.getByText(/2×3 lumber/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /offcuts \(2\)/i }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'About Reusable offcuts' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('offcut-completion')).toHaveTextContent('0 offcuts returned');
  });

  it('defaults to the lumber segment when no panels remain', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Lumber Default Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.getByRole('tab', { name: /lumber \(1\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/2×3 lumber/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();
  });

  it('records the cut-plans-reviewed marker and restores it after reload', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Reviewed Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });

    const first = await renderOptimize(project.id);
    await openCutsStep(user);
    await waitFor(() => {
      expect(screen.getByTestId('cut-plans-reviewed')).toBeInTheDocument();
    });
    const stored = await getOptimizationWorkflow(project.id);
    expect(stored?.cutPlansReviewedAt).toEqual(expect.any(String));
    const reviewedAt = stored!.cutPlansReviewedAt;

    first.unmount();
    await renderOptimize(project.id);

    expect(screen.getByTestId('cut-plans-reviewed')).toHaveTextContent(
      /cut plans reviewed/i,
    );
    const restored = await getOptimizationWorkflow(project.id);
    expect(restored?.cutPlansReviewedAt).toBe(reviewedAt);
  });

  it('flags panels that are larger than the stock sheet', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Oversized Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Big Slab',
      length: 3,
      width: 1.5,
      height: 0,
    });

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();
    expect(screen.getByText(/no plywood panels can be placed/i)).toBeInTheDocument();
    expect(screen.getByTestId('cut-unplaced')).toHaveTextContent(/unplaced \(1\)/i);
    expect(screen.getByTestId('unplaced-panel')).toHaveTextContent(
      'Big Slab · 3.00 m × 1.50 m',
    );

    await user.click(screen.getByRole('button', { name: /notifications \(1\)/i }));
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(/1 panel exceeds the stock sheet/i),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByText('Big Slab (3.00 m × 1.50 m)'),
    ).toBeInTheDocument();
  });

  it('lists every unplaced panel and matches the notification items', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Oversized Column Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C',
      length: 12,
      width: 5,
      height: 5,
    });

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.getByTestId('cut-unplaced')).toHaveTextContent(/unplaced \(4\)/i);
    expect(
      within(screen.getByTestId('cut-unplaced')).getByRole('button', {
        name: 'About Unplaced items',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('unplaced-panel')).toHaveLength(4);
    expect(screen.getByTestId('cut-unplaced')).toHaveTextContent(
      'C · 12.00 m × 5.00 m',
    );
    expect(screen.getByTestId('cut-unplaced')).toHaveTextContent(
      'C · 5.00 m × 5.00 m',
    );

    await user.click(screen.getByRole('button', { name: /notifications \(1\)/i }));
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(/4 panels exceed the stock sheet/i),
    ).toBeInTheDocument();
    expect(
      within(drawer).getAllByText('C (12.00 m × 5.00 m)'),
    ).toHaveLength(2);
    expect(
      within(drawer).getAllByText('C (5.00 m × 5.00 m)'),
    ).toHaveLength(2);
  });
});

describe('OptimizationScreen SVG export', () => {
  function mockObjectUrls() {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:cut-plan');
    const revokeObjectURL = vi.fn<(url: string) => void>(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    return { createObjectURL, revokeObjectURL };
  }

  function blobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  it('downloads a generated sheet as an SVG with the required namespace and filename', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Export Plan Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    const { createObjectURL, revokeObjectURL } = mockObjectUrls();
    let downloadedFilename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });

    await renderOptimize(project.id);
    await openCutsStep(user);
    await user.click(screen.getByRole('button', { name: /export sheet 1 as svg/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    const markup = await blobText(blob);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('cut-plan-sheet-0');
    expect(downloadedFilename).toMatch(/export-plan-site-cut-plan-sheet-1-.*\.svg$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cut-plan');
  });

  it('exports every generated sheet at once', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Export All Site' });
    for (let index = 0; index < 4; index += 1) {
      await createStructuralMember({
        projectId: project.id,
        type: 'slab',
        label: `S${index + 1}`,
        length: 1.2,
        width: 1.2,
        height: 0,
      });
    }
    const { createObjectURL } = mockObjectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await renderOptimize(project.id);
    await openCutsStep(user);
    expect(document.getElementById('cut-plan-sheet-1')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /export all sheets/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});

describe('OptimizationScreen sheet navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function seedMultiSheetProject(name: string) {
    const project = await seedProject({ name });
    for (let index = 0; index < 4; index += 1) {
      await createStructuralMember({
        projectId: project.id,
        type: 'slab',
        label: `S${index + 1}`,
        length: 1.2,
        width: 1.2,
        height: 0,
      });
    }
    return project;
  }

  function mockDownload() {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:sheet');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    let downloadedFilename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });
    return () => downloadedFilename;
  }

  it('selects a sheet from the thumbnail grid and exports that sheet', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet Grid Site');
    const downloadedFilename = mockDownload();

    await renderOptimize(project.id);
    await openCutsStep(user);

    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 1 of 2');
    expect(screen.getByTestId('sheet-thumbnail-0')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('cut-plan-sheet-0')).toHaveClass('w-full');

    await user.click(screen.getByRole('button', { name: /select sheet 2/i }));

    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 2 of 2');
    expect(screen.getByTestId('sheet-thumbnail-1')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /export sheet 2 as svg/i }));

    expect(downloadedFilename()).toMatch(/-cut-plan-sheet-2-.*\.svg$/);
  });

  it('exports the selected sheet as PNG', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet Png Site');
    const downloadedFilename = mockDownload();
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback: BlobCallback) => {
        callback(new Blob(['png'], { type: 'image/png' }));
      },
    );

    await renderOptimize(project.id);
    await openCutsStep(user);

    await user.click(screen.getByRole('button', { name: /select sheet 2/i }));
    await user.click(screen.getByRole('button', { name: /export sheet 2 as png/i }));

    await waitFor(() => {
      expect(downloadedFilename()).toMatch(/-cut-plan-sheet-2-.*\.png$/);
    });
  });

  it('navigates sheets with the mobile carousel controls', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet Carousel Site');

    await renderOptimize(project.id);
    await openCutsStep(user);

    await user.click(screen.getByRole('button', { name: /next sheet/i }));
    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 2 of 2');
    expect(screen.getByRole('button', { name: /next sheet/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /previous sheet/i }));
    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 1 of 2');
    expect(screen.getByRole('button', { name: /previous sheet/i })).toBeDisabled();
  });

  it('changes sheets by swiping the selected sheet', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet Swipe Site');

    await renderOptimize(project.id);
    await openCutsStep(user);

    const detail = screen.getByTestId('selected-sheet-detail');
    fireEvent.touchStart(detail, { touches: [{ clientX: 240 }] });
    fireEvent.touchEnd(detail, { changedTouches: [{ clientX: 60 }] });
    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 2 of 2');

    fireEvent.touchStart(detail, { touches: [{ clientX: 60 }] });
    fireEvent.touchEnd(detail, { changedTouches: [{ clientX: 240 }] });
    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 1 of 2');
  });

  it('opens a sheet fullscreen and supports zoom controls and pinch', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet Fullscreen Site');

    await renderOptimize(project.id);
    await openCutsStep(user);

    await user.click(screen.getByRole('button', { name: /open sheet 1 fullscreen/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-zoom-level')).toHaveTextContent('100%');

    await user.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.getByTestId('sheet-zoom-level')).toHaveTextContent('125%');

    const zoomArea = screen.getByTestId('sheet-zoom-area');
    fireEvent.touchStart(zoomArea, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
      changedTouches: [{ clientX: 100, clientY: 0 }],
    });
    fireEvent.touchMove(zoomArea, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 200, clientY: 0 },
      ],
      changedTouches: [{ clientX: 200, clientY: 0 }],
    });
    expect(screen.getByTestId('sheet-zoom-level')).toHaveTextContent('250%');

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles a list view of the selected sheet panels', async () => {
    const user = userEvent.setup();
    const project = await seedMultiSheetProject('Sheet List Site');

    await renderOptimize(project.id);
    await openCutsStep(user);

    await user.click(screen.getByRole('button', { name: /^list view$/i }));

    const list = screen.getByTestId('sheet-panel-list');
    const listLabels = () =>
      within(list)
        .getAllByRole('listitem')
        .map((row) => row.textContent ?? '');
    const firstSheetRows = listLabels();
    expect(firstSheetRows).toHaveLength(2);
    expect(within(list).getAllByText(/1\.20 m × 1\.20 m/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /diagram view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /select sheet 2/i }));
    expect(screen.getByTestId('sheet-counter')).toHaveTextContent('Sheet 2 of 2');
    expect(listLabels()).not.toEqual(firstSheetRows);

    await user.click(screen.getByRole('button', { name: /diagram view/i }));
    expect(screen.queryByTestId('sheet-panel-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('cut-plan-sheet-1')).toBeInTheDocument();
  });
});

describe('OptimizationScreen reuse review', () => {
  it('filters requirements by status and defaults to needs decision', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Filter Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Long Brace',
      length: 7,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);

    expect(screen.getByRole('button', { name: /needs decision \(2\)/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /satisfied \(0\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new stock \(0\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no match \(1\)/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^accept /i })).toHaveLength(2);
    expect(screen.queryByText('Long Brace')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /no match \(1\)/i }));

    expect(screen.getByText('Long Brace')).toBeInTheDocument();
    expect(screen.getByText(/no active inventory pieces match/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /satisfied \(0\)/i }));

    expect(screen.getByText(/no requirements in satisfied/i)).toBeInTheDocument();
  });

  it('tracks progress across accepted, new-stock, declined, and unmatched requirements', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Progress Site' });
    for (const label of ['Brace A', 'Brace B', 'Brace C']) {
      await createLumberRequirement({
        projectId: project.id,
        label,
        length: 2.4,
        crossSection: '2x3',
      });
    }
    await createLumberRequirement({
      projectId: project.id,
      label: 'Long Brace',
      length: 7,
      crossSection: '2x3',
    });
    for (let index = 0; index < 3; index += 1) {
      await addPiece({
        projectId: project.id,
        materialType: 'lumber',
        length: 3,
        crossSection: '2x3',
      });
    }

    await renderOptimize(project.id);
    const progress = () => screen.getByRole('progressbar', { name: /reuse review progress/i });

    expect(progress()).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByTestId('reuse-progress-summary')).toHaveTextContent(
      '1 of 4 requirements decided',
    );

    await user.click(
      screen.getAllByRole('button', { name: /accept .* for brace a/i })[0]!,
    );
    await waitFor(() => expect(progress()).toHaveAttribute('aria-valuenow', '2'));

    await user.click(screen.getByRole('button', { name: /plan brace b from new stock/i }));
    await waitFor(() => expect(progress()).toHaveAttribute('aria-valuenow', '3'));

    while (
      screen.queryAllByRole('button', { name: /decline .* for brace c/i }).length > 0
    ) {
      await user.click(
        screen.getAllByRole('button', { name: /decline .* for brace c/i })[0]!,
      );
    }

    await waitFor(() => expect(progress()).toHaveAttribute('aria-valuenow', '4'));
    expect(screen.getByTestId('reuse-progress-summary')).toHaveTextContent(
      '4 of 4 requirements decided',
    );
    expect(
      screen.getByRole('button', { name: /continue to plan cuts/i }),
    ).toBeInTheDocument();
  });

  it('shows the top three candidates until the list is expanded', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Top Three Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    for (let index = 0; index < 4; index += 1) {
      await addPiece({
        projectId: project.id,
        materialType: 'lumber',
        length: 3,
        crossSection: '2x3',
      });
    }

    await renderOptimize(project.id);

    expect(screen.getAllByRole('button', { name: /^accept /i })).toHaveLength(3);

    await user.click(
      screen.getByRole('button', { name: /show all 4 candidates for brace a/i }),
    );

    expect(screen.getAllByRole('button', { name: /^accept /i })).toHaveLength(4);

    await user.click(
      screen.getByRole('button', { name: /show fewer 4 candidates for brace a/i }),
    );

    expect(screen.getAllByRole('button', { name: /^accept /i })).toHaveLength(3);
  });

  it('groups cards by structural member with a color tag', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Group Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.5,
      width: 0.3,
      height: 3,
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1,
      width: 1,
      thickness: 0.018,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 1,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /no match \(5\)/i }));

    const column = screen.getByRole('region', { name: 'C1' });
    expect(within(column).getByRole('heading', { name: 'C1' })).toBeInTheDocument();
    expect(column.querySelector('span[aria-hidden="true"]')?.getAttribute('style')).toContain(
      'background-color',
    );
    expect(
      screen.getByRole('region', { name: 'Lumber requirements' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /needs decision \(1\)/i }));

    const slab = screen.getByRole('region', { name: 'S1' });
    expect(within(slab).getByRole('heading', { name: 'S1' })).toBeInTheDocument();
  });

  it('restores a declined candidate', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Restore Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
    });

    await renderOptimize(project.id);
    await user.click(screen.getByRole('button', { name: /^decline /i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /no match \(1\)/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /no match \(1\)/i }));
    expect(screen.getByText(/all matching pieces have been declined/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show declined candidates for brace a/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /restore .* for brace a/i }),
    );

    expect(
      await screen.findByRole('button', { name: /needs decision \(1\)/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /needs decision \(1\)/i }));
    expect(screen.getByRole('button', { name: /^accept /i })).toBeInTheDocument();
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      declinedCandidates: [],
    });
  });

  it('resets one requirement without touching the others', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Per Requirement Reset Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace B',
      length: 2.4,
      crossSection: '2x3',
    });
    for (let index = 0; index < 2; index += 1) {
      await addPiece({
        projectId: project.id,
        materialType: 'lumber',
        length: 3,
        crossSection: '2x3',
      });
    }

    await renderOptimize(project.id);

    while (
      screen.queryAllByRole('button', { name: /decline .* for brace a/i }).length > 0
    ) {
      await user.click(
        screen.getAllByRole('button', { name: /decline .* for brace a/i })[0]!,
      );
    }

    await user.click(screen.getByRole('button', { name: /no match \(1\)/i }));
    await user.click(
      screen.getByRole('button', { name: /reset decisions for brace a/i }),
    );

    await user.click(screen.getByRole('button', { name: /needs decision \(2\)/i }));
    expect(screen.getAllByRole('button', { name: /^accept /i }).length).toBeGreaterThan(0);
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      declinedCandidates: [],
    });

    await user.click(screen.getByRole('button', { name: /plan brace b from new stock/i }));
    await user.click(screen.getByRole('button', { name: /new stock \(1\)/i }));
    await user.click(
      screen.getByRole('button', { name: /reset decisions for brace b/i }),
    );

    expect(
      await screen.findByRole('button', { name: /needs decision \(2\)/i }),
    ).toBeInTheDocument();
    await expect(getOptimizationWorkflow(project.id)).resolves.toMatchObject({
      newStockRequirementIds: [],
    });
  });

  it('keeps declined candidates reachable after planning from new stock', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Declined New Stock Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    for (let index = 0; index < 2; index += 1) {
      await addPiece({
        projectId: project.id,
        materialType: 'lumber',
        length: 3,
        crossSection: '2x3',
      });
    }

    await renderOptimize(project.id);
    await user.click(
      screen.getAllByRole('button', { name: /decline .* for brace a/i })[0]!,
    );
    await user.click(screen.getByRole('button', { name: /plan brace a from new stock/i }));
    await user.click(screen.getByRole('button', { name: /new stock \(1\)/i }));

    expect(
      screen.getByRole('button', { name: /show declined candidates for brace a/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /show declined candidates for brace a/i }),
    );
    expect(
      screen.getByRole('button', { name: /restore .* for brace a/i }),
    ).toBeInTheDocument();
  });

  it('points oversized-only requirements at the stock settings', async () => {
    const project = await seedProject({ name: 'Oversized Review Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Big Slab',
      length: 0.6,
      width: 3.5,
      height: 0,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.2,
      width: 0.2,
      thickness: 0.018,
    });

    await renderOptimize(project.id);

    expect(screen.getByText(/remaining panels exceed stock sizes/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /review stock sizes/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^accept /i })).not.toBeInTheDocument();
  });
});
