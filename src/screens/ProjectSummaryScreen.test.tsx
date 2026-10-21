import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { db } from '@/db/db';
import { addPiece } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { saveCuttingPlanSnapshot } from '@/db/plans';
import { createProject } from '@/db/projects';
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderSummary(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/summary`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /^summary$/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading summary/i)).not.toBeInTheDocument();
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
  it('shows cost-weighted utilization, waste, reuse counts, and new material requirements', async () => {
    const project = await createProject({ name: 'Summary Site' });
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
    const project = await createProject({ name: 'Accepted Site' });
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
      satisfiedRequirementIds: [reusedPanelId],
      acceptedByRequirement: { [reusedPanelId]: 'reused-piece' },
    });

    await renderSummary(project.id);

    expect(screen.getByTestId('summary-reused-pieces')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-reuse-events')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-new-sheets')).toHaveTextContent('1');
    expect(screen.getAllByText(/₱850/).length).toBeGreaterThan(0);
    expect(screen.getByText(/plywood utilization/i)).toBeInTheDocument();
  });

  it('shows the PHP procurement breakdown', async () => {
    const project = await createProject({ name: 'Savings Site' });
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

    await renderSummary(project.id);

    expect(screen.getAllByText(/phenolic sheets avoided/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱850/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₱120/).length).toBeGreaterThan(0);
    expect(screen.getByText(/estimated savings/i)).toBeInTheDocument();
    expect(screen.getByText(/total material cost/i)).toBeInTheDocument();
  });

  it('exports the full inventory, including retired pieces, as CSV', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Export Site' });
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
    await db.pieces.update(retired.id, { condition: 'Retired', retired: true });

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

    expect(csv).toContain('id,projectId,materialType,length,width,thickness');
    expect(csv).toContain(active.id);
    expect(csv).toContain(retired.id);
    expect(csv).toContain(',true,');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:summary-export');
  });
});
