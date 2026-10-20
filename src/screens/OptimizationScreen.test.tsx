import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { db } from '@/db/db';
import { addPiece, getPiece, getUsageLog, recordUsage } from '@/db/inventory';
import { createLumberRequirement, createStructuralMember } from '@/db/members';
import { createProject } from '@/db/projects';
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderOptimize(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/optimize`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /optimization/i });
  await waitFor(() => {
    expect(screen.queryByText(/loading matches/i)).not.toBeInTheDocument();
  });
}

describe('OptimizationScreen matching', () => {
  it('renders decomposed member panels as match requirements', async () => {
    const project = await createProject({ name: 'Optimize Site' });
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
    expect(screen.getAllByText(/0\.50 m × 3\.00 m/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\.30 m × 3\.00 m/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/requires cutting/i).length).toBeGreaterThan(0);
  });

  it('accepts a match, increments usage, logs the member, and satisfies the requirement', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Optimize Site' });
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
    expect(screen.getByText('Brace A')).toBeInTheDocument();
    expect(screen.getByText(/usage 0/i)).toBeInTheDocument();
    expect(screen.getByText(/requires cutting/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(await screen.findByText(/satisfied/i)).toBeInTheDocument();
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
    const project = await createProject({ name: 'Optimize Site' });
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

  it('declines a candidate without consuming it or satisfying the requirement', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Optimize Site' });
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
