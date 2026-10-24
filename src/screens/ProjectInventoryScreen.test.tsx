import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { db } from '@/db/db';
import { addPiece, recordUsage, retirePiece } from '@/db/inventory';
import { seedProject } from '@/test/fixtures';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderInventory(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/inventory`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /^inventory$/i });
}

describe('ProjectInventoryScreen', () => {
  it('adds a phenolic piece through the form and lists it with its details', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Inventory Site' });
    await renderInventory(project.id);

    await user.click(screen.getByRole('button', { name: /add piece/i }));
    await user.selectOptions(screen.getByLabelText(/material type/i), 'phenolic');
    await user.type(screen.getByLabelText(/^length/i), '1.22');
    await user.type(screen.getByLabelText(/^width/i), '2.44');
    await user.type(screen.getByLabelText(/^thickness/i), '0.018');
    await user.type(screen.getByLabelText(/storage location/i), 'Rack A');
    await user.click(screen.getByRole('button', { name: /save piece/i }));

    const row = await screen.findByRole('row', { name: /rack a/i });
    expect(within(row).getByText(/phenolic board/i)).toBeInTheDocument();
    expect(within(row).getByText(/1\.22 × 2\.44 × 0\.02 m/i)).toBeInTheDocument();
    expect(within(row).getByText('Good')).toBeInTheDocument();
    expect(within(row).getByText('0')).toBeInTheDocument();

    const pieces = await db.pieces.toArray();
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      projectId: project.id,
      materialType: 'phenolic',
      storageLocation: 'Rack A',
      usageCount: 0,
    });
  });
});

describe('ProjectInventoryScreen lifecycle and history', () => {
  async function seedUsedPiece(label = 'C1') {
    const project = await seedProject({ name: 'Lifecycle Site' });
    const piece = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3.6,
      crossSection: '2x3',
      storageLocation: 'Rack C',
    });
    for (let use = 1; use <= 5; use += 1) {
      await recordUsage(
        piece.id,
        project.id,
        use === 5 ? label : `B${use}`,
        `2026-02-0${use}T00:00:00.000Z`,
      );
    }
    return { project, piece };
  }

  it('shows the automatic For Inspection condition at five uses and the full usage log', async () => {
    const user = userEvent.setup();
    const { project } = await seedUsedPiece('C1');
    await renderInventory(project.id);

    const row = await screen.findByRole('row', { name: /rack c/i });
    expect(within(row).getByText('For Inspection')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /view piece/i }));

    expect(await screen.findByRole('heading', { name: /piece details/i })).toBeInTheDocument();
    expect(await screen.findByText('C1')).toBeInTheDocument();
    expect(screen.getAllByText(/^B[1-4]$/)).toHaveLength(4);
    expect(screen.getByRole('heading', { name: /usage log/i })).toBeInTheDocument();
  });

  it('lets an engineer override an inspected piece back to Good', async () => {
    const user = userEvent.setup();
    const { project, piece } = await seedUsedPiece();
    await renderInventory(project.id);

    const row = await screen.findByRole('row', { name: /rack c/i });
    await user.click(within(row).getByRole('button', { name: /edit piece/i }));

    const condition = await screen.findByLabelText('Condition');
    expect(condition).toHaveValue('For Inspection');
    await user.selectOptions(condition, 'Good');
    await user.click(screen.getByRole('button', { name: /save piece/i }));

    expect(await screen.findByRole('row', { name: /rack c/i })).toHaveTextContent(/good/i);
    const stored = await db.pieces.get(piece.id);
    expect(stored?.condition).toBe('Good');
    expect(stored?.usageCount).toBe(5);
  });

  it('retires a piece so it leaves the active inventory but stays stored', async () => {
    const user = userEvent.setup();
    const { project, piece } = await seedUsedPiece();
    await renderInventory(project.id);

    const row = await screen.findByRole('row', { name: /rack c/i });
    await user.click(within(row).getByRole('button', { name: /view piece/i }));
    await user.click(await screen.findByRole('button', { name: /retire piece/i }));

    expect(await screen.findByText(/no pieces in inventory yet/i)).toBeInTheDocument();
    const stored = await db.pieces.get(piece.id);
    expect(stored).toMatchObject({ retired: true, condition: 'Retired', usageCount: 5 });
    expect(await db.usageLog.where('pieceId').equals(piece.id).count()).toBe(5);
    expect(await retirePiece(piece.id)).toMatchObject({ retired: true });
  });
});

describe('ProjectInventoryScreen search, filter, and sort', () => {
  async function seedInventory() {
    const project = await seedProject({ name: 'Browse Site' });
    const phenolic = await addPiece({
      projectId: project.id,
      materialType: 'phenolic',
      length: 1.22,
      width: 2.44,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });
    const lumber = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3,
      crossSection: '2x3',
      storageLocation: 'Rack B',
    });
    const usedLumber = await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 4.8,
      crossSection: '2x4',
      storageLocation: 'Ground',
    });
    for (let use = 1; use <= 5; use += 1) {
      await recordUsage(usedLumber.id, project.id, `C${use}`);
    }
    return { project, phenolic, lumber, usedLumber };
  }

  it('adds a lumber piece with length and cross-section', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Lumber Site' });
    await renderInventory(project.id);

    await user.click(screen.getByRole('button', { name: /add piece/i }));
    await user.selectOptions(screen.getByLabelText(/material type/i), 'lumber');
    await user.type(screen.getByLabelText(/^length/i), '3.6');
    await user.selectOptions(screen.getByLabelText(/cross-section/i), '2x4');
    await user.type(screen.getByLabelText(/storage location/i), 'Rack D');
    await user.click(screen.getByRole('button', { name: /save piece/i }));

    const row = await screen.findByRole('row', { name: /rack d/i });
    expect(within(row).getByText('3.60 m · 2x4')).toBeInTheDocument();
    expect(within(row).getByText('Lumber')).toBeInTheDocument();
  });

  it('searches instantly by dimension, type, or storage location', async () => {
    const user = userEvent.setup();
    const { project } = await seedInventory();
    await renderInventory(project.id);

    const search = screen.getByLabelText(/search inventory/i);

    await user.type(search, '2x3');
    expect(await screen.findByRole('row', { name: /rack b/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack a/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /ground/i })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'lumber');
    expect(await screen.findByRole('row', { name: /rack b/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /ground/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack a/i })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'rack a');
    expect(await screen.findByRole('row', { name: /rack a/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack b/i })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '1.22 x 2.44');
    expect(await screen.findByRole('row', { name: /rack a/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /ground/i })).not.toBeInTheDocument();
  });

  it('filters by material type, condition, and usage range', async () => {
    const user = userEvent.setup();
    const { project } = await seedInventory();
    await renderInventory(project.id);

    await user.selectOptions(screen.getByLabelText(/filter by type/i), 'lumber');
    expect(await screen.findByRole('row', { name: /rack b/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /ground/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack a/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/filter by type/i), 'all');
    await user.type(screen.getByLabelText(/minimum uses/i), '1');
    expect(await screen.findByRole('row', { name: /ground/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /rack a/i })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/minimum uses/i));
    await user.selectOptions(screen.getByLabelText(/filter by condition/i), 'Good');
    expect(await screen.findByRole('row', { name: /rack a/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /rack b/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /ground/i })).not.toBeInTheDocument();
  });

  it('sorts by the usage column when its header is clicked', async () => {
    const user = userEvent.setup();
    const { project } = await seedInventory();
    await renderInventory(project.id);

    await screen.findByRole('row', { name: /rack a/i });
    await user.click(screen.getByRole('button', { name: /sort by usage/i }));

    const firstRowUses = () => {
      const row = screen.getAllByRole('row')[1];
      return row ? within(row).getAllByRole('cell')[4]?.textContent : undefined;
    };
    expect(firstRowUses()).toBe('0');

    await user.click(screen.getByRole('button', { name: /sort by usage/i }));
    expect(firstRowUses()).toBe('5');
  });
});
