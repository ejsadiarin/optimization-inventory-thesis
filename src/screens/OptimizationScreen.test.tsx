import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { db } from '@/db/db';
import { addPiece, getPiece, getUsageLog, listPieces, recordUsage } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { seedProject } from '@/test/fixtures';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderOptimize(projectId: string) {
  unlockProject(projectId);
  const view = render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/optimize`]}>
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

    expect(
      await screen.findByText(/all requirements satisfied by reused pieces/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/usage 1/i)).toBeInTheDocument();
    expect(screen.getByText(/excluded from cutting/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();

    const log = await getUsageLog(piece.id);
    expect(log).toHaveLength(1);
    expect(log[0]!.structuralMemberLabel).toBe('Brace A');
    await expect(getPiece(piece.id)).resolves.toMatchObject({ usageCount: 1, condition: 'Good' });
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
    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/usage 5/i)).toBeInTheDocument();
    expect(await screen.findByText(/for inspection/i)).toBeInTheDocument();
    await expect(getPiece(piece.id)).resolves.toMatchObject({
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
    expect(
      await screen.findByText(/all requirements satisfied by reused pieces/i),
    ).toBeInTheDocument();
    first.unmount();

    await renderOptimize(project.id);

    expect(await screen.findByText(/excluded from cutting/i)).toBeInTheDocument();
    expect(
      screen.getByText(/all requirements satisfied by reused pieces/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    await expect(getUsageLog(piece.id)).resolves.toHaveLength(1);
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

    expect(await screen.findByText(/excluded from cutting/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no active inventory pieces match/i)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    await expect(getUsageLog(piece.id)).resolves.toHaveLength(1);
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
    expect(screen.getByText(/no active inventory pieces match/i)).toBeInTheDocument();
    expect(screen.queryByText('Satisfied')).not.toBeInTheDocument();
    await expect(getUsageLog(piece.id)).resolves.toHaveLength(0);
    await expect(getPiece(piece.id)).resolves.toMatchObject({ usageCount: 0 });
  });
});

describe('OptimizationScreen cutting plans', () => {
  it('renders plywood SVG plans and grouped lumber cuts for remaining requirements', async () => {
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

    expect(screen.getByRole('heading', { name: /cutting plans/i })).toBeInTheDocument();
    expect(screen.getByTestId('cut-plan-sheet-0')).toBeInTheDocument();
    expect(screen.getByText('0.60 × 0.60 m')).toBeInTheDocument();
    expect(screen.getAllByText('S1').length).toBeGreaterThan(0);

    expect(screen.getByText(/2×3 lumber/i)).toBeInTheDocument();
    expect(screen.getByText(/stock 1 · 2\.40 m/i)).toBeInTheDocument();
    expect(screen.getAllByText('Brace A').length).toBeGreaterThan(0);
    expect(screen.getByText(/longer than the longest stock length/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated savings/i)).toBeInTheDocument();
  });

  it('recomputes plans and shows the all-satisfied state after accepting a reuse match', async () => {
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
    expect(screen.getByTestId('cut-plan-sheet-0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(
      await screen.findByText(/all requirements satisfied by reused pieces/i),
    ).toBeInTheDocument();
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

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    const addButton = screen.getByRole('button', { name: /add selected to inventory/i });
    expect(addButton).toBeDisabled();

    await user.click(checkboxes[0]!);
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    expect(await screen.findByRole('status')).toHaveTextContent(/added 1 offcut/i);

    const pieces = await listPieces(project.id);
    const added = pieces.filter((piece) => piece.source === 'Cut plan offcut');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      materialType: 'phenolic',
      condition: 'Good',
      usageCount: 0,
      thickness: 0.012,
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

  it('flags panels that are larger than the stock sheet', async () => {
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

    expect(screen.queryByTestId('cut-plan-sheet-0')).not.toBeInTheDocument();
    expect(screen.getByText(/cannot fit on a stock sheet/i)).toBeInTheDocument();
    expect(screen.getByText(/no plywood panels can be placed/i)).toBeInTheDocument();
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
    expect(screen.getByTestId('cut-plan-sheet-1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export all sheets/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});
