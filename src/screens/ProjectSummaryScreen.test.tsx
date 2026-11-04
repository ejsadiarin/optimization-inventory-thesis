import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { addPiece, retirePiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import * as membersDb from '@/db/members';
import { saveCuttingPlanSnapshot } from '@/db/plans';
import { emptyWorkflow, saveOptimizationWorkflow } from '@/db/workflow';
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

async function renderSummary(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/summary`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /^summary$/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading summary/i)).not.toBeInTheDocument();
  });
}

async function markOptimizationReviewed(projectId: string) {
  await saveOptimizationWorkflow(projectId, {
    ...emptyWorkflow(),
    cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
  });
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('ProjectSummaryScreen', () => {
  it('keeps the page header and offers retry when the summary cannot be built', async () => {
    const project = await seedProject({ name: 'Summary Error Site' });
    vi.spyOn(membersDb, 'listStructuralMembers').mockRejectedValueOnce(new Error('offline'));

    await renderSummary(project.id);

    expect(screen.getByRole('heading', { name: /^summary$/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not build the project summary/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows cost-weighted utilization, waste, reuse counts, and new material requirements', async () => {
    const project = await seedProject({ name: 'Summary Site' });
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
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2,
      crossSection: '2x3',
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });
    await markOptimizationReviewed(project.id);

    await renderSummary(project.id);

    expect(screen.getByRole('link', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText(/overall utilization/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-utilization')).toHaveTextContent('95.9%');
    expect(screen.getByText(/cutting waste/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-waste')).toHaveTextContent('4.1%');
    expect(screen.getByText(/reused pieces/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-reused-pieces')).toHaveTextContent('0');
    expect(screen.getByText(/reuse events/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-reuse-events')).toHaveTextContent('0');
    expect(screen.getByText(/new sheets required/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-new-sheets')).toHaveTextContent('2');
    expect(screen.getByText(/new lumber pieces required/i)).toBeInTheDocument();
    expect(screen.getByTestId('summary-new-lumber-pieces')).toHaveTextContent('1');
  });

  it('loads the accepted plan and excludes reused requirements from new stock', async () => {
    const project = await seedProject({ name: 'Accepted Site' });
    const reused = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Reused',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Narrow',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Wide',
      length: 1.2,
      width: 0.8,
      height: 0,
    });
    const reusedPanelId = `${reused.id}-panel-1`;
    await saveCuttingPlanSnapshot(project.id, {
      satisfiedRequirementIds: [reusedPanelId, 'removed-requirement'],
      acceptedByRequirement: {
        [reusedPanelId]: 'reused-piece',
        'removed-requirement': 'removed-piece',
      },
    });

    await renderSummary(project.id);

    expect(screen.getByTestId('summary-reused-pieces')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-reuse-events')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-new-sheets')).toHaveTextContent('1');
    expect(screen.getAllByText(/₱850/).length).toBeGreaterThan(0);
    expect(screen.getByText(/plywood utilization/i)).toBeInTheDocument();
  });

  it('reads reuse decisions from the workflow document over the latest plan', async () => {
    const project = await seedProject({ name: 'Workflow Site' });
    const reused = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Reused',
      length: 0.6,
      width: 0.6,
      height: 0,
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'New Stock',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    const reusedPanelId = `${reused.id}-panel-1`;
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });
    await saveOptimizationWorkflow(project.id, {
      ...emptyWorkflow(),
      satisfiedRequirementIds: [reusedPanelId],
      acceptedByRequirement: { [reusedPanelId]: piece.id },
    });

    await renderSummary(project.id);

    expect(screen.getByTestId('summary-reused-pieces')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-reuse-events')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-new-sheets')).toHaveTextContent('1');
  });

  it('shows the PHP procurement breakdown', async () => {
    const project = await seedProject({ name: 'Savings Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Narrow',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Wide',
      length: 1.2,
      width: 0.8,
      height: 0,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2,
      crossSection: '2x3',
    });
    await markOptimizationReviewed(project.id);

    await renderSummary(project.id);

    expect(screen.getAllByText(/phenolic sheets avoided/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱850/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱120/).length).toBeGreaterThan(0);
    expect(screen.getByText(/estimated savings/i)).toBeInTheDocument();
    expect(screen.getByText(/total material cost/i)).toBeInTheDocument();
  });

  it('points an empty project at the members screen', async () => {
    const project = await seedProject({ name: 'Empty Summary Site' });

    await renderSummary(project.id);

    expect(screen.getByRole('heading', { name: /no requirements yet/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /add structural members/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/members`);
    expect(screen.queryByText(/overall utilization/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/optimization not started/i)).not.toBeInTheDocument();
  });

  it('shows inventory and cost context before optimization starts', async () => {
    const project = await seedProject({ name: 'Not Started Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Slab A',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 0.6,
      width: 0.6,
      thickness: 0.018,
    });
    await saveCuttingPlanSnapshot(project.id, {
      satisfiedRequirementIds: [],
      acceptedByRequirement: {},
    });

    await renderSummary(project.id);

    expect(
      screen.getByRole('heading', { name: /optimization not started/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /start optimization/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize?step=reuse`);
    expect(screen.getByTestId('summary-context-pieces')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-context-active-pieces')).toHaveTextContent('1');
    expect(screen.getAllByText(/₱850/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱120/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/overall utilization/i)).not.toBeInTheDocument();
  });

  it('shows the live summary and a revisit action once optimization is reviewed', async () => {
    const project = await seedProject({ name: 'Reviewed Site' });
    const member = await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Slab A',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    await saveOptimizationWorkflow(project.id, {
      ...emptyWorkflow(),
      satisfiedRequirementIds: [],
      newStockRequirementIds: [`${member.id}-panel-1`],
      cutPlansReviewedAt: '2026-11-01T00:00:00.000Z',
    });

    await renderSummary(project.id);

    expect(screen.getByText(/overall utilization/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /revisit optimization/i }),
    ).toHaveAttribute('href', `/projects/${project.id}/optimize`);
    expect(screen.queryByText(/optimization not started/i)).not.toBeInTheDocument();
  });

  it('exports the full inventory, including retired pieces, as CSV', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Export Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'Slab A',
      length: 1.2,
      width: 0.7,
      height: 0,
    });
    await markOptimizationReviewed(project.id);
    const active = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.2,
      width: 0.6,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });
    const retired = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 2.4,
      crossSection: '2x3',
      condition: 'For Inspection',
    });
    await retirePiece(project.id, retired.id);

    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:summary-export');
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
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await renderSummary(project.id);
    await user.click(screen.getByRole('button', { name: /export inventory csv/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const csv = await blobText(blob);

    expect(csv).toContain('id,projectId,label,materialType,length,width,thickness');
    expect(csv).toContain(active.id);
    expect(csv).toContain(retired.id);
    expect(csv).toContain(',true,');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:summary-export');
  });
});
