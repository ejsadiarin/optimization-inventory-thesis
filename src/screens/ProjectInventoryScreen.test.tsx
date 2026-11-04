import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import {
  addPiece,
  getPiece,
  getUsageLog,
  listPieces,
  recordUsage,
  retirePiece,
} from '@/db/inventory';
import { seedProject } from '@/test/fixtures';
import {
  failNextGetActivePieces,
  resetInventoryMock,
} from '@/test/inventoryMock';
import { resetViewport, useMobileViewport } from '@/test/viewport';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/inventory')>();
  const mock = await import('@/test/inventoryMock');
  return { ...actual, ...mock };
});
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  resetInventoryMock();
});

afterEach(() => {
  resetViewport();
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
    await screen.findByText(/no pieces in inventory yet/i);

    await user.click(screen.getByRole('button', { name: /add piece/i }));
    await user.type(screen.getByLabelText(/label \(optional\)/i), 'Left wall panel');
    await user.selectOptions(screen.getByLabelText(/material type/i), 'phenolic');
    await user.type(screen.getByLabelText(/^length/i), '1.22');
    await user.type(screen.getByLabelText(/^width/i), '2.44');
    await user.type(screen.getByLabelText(/^thickness/i), '0.018');
    await user.type(screen.getByLabelText(/storage location/i), 'Rack A');
    await user.click(screen.getByRole('button', { name: /save piece/i }));

    const row = await screen.findByRole('row', { name: /rack a/i });
    expect(within(row).getByText('Left wall panel')).toBeInTheDocument();
    expect(within(row).getByText(/phenolic board/i)).toBeInTheDocument();
    expect(within(row).getByText(/1\.22 × 2\.44 × 0\.02 m/i)).toBeInTheDocument();
    expect(within(row).getByText('Good')).toBeInTheDocument();
    expect(within(row).getByText('0')).toBeInTheDocument();

    const pieces = await listPieces(project.id);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      projectId: project.id,
      label: 'Left wall panel',
      materialType: 'phenolic',
      storageLocation: 'Rack A',
      usageCount: 0,
    });
  });
});

describe('ProjectInventoryScreen labels and row actions', () => {
  async function seedLabelledPieces() {
    const project = await seedProject({ name: 'Labelled Site' });
    await addPiece({
      projectId: project.id,
      label: 'Left wall panel',
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
      storageLocation: 'Rack A',
    });
    await addPiece({
      projectId: project.id,
      label: 'Right wall panel',
      materialType: 'phenolic',
      length: 2.44,
      width: 1.22,
      thickness: 0.018,
      storageLocation: 'Rack B',
    });
    return project;
  }

  it('searches inventory by optional label', async () => {
    const user = userEvent.setup();
    const project = await seedLabelledPieces();
    await renderInventory(project.id);

    await user.type(screen.getByLabelText(/search inventory/i), 'left wall');

    expect(await screen.findByRole('row', { name: /left wall panel/i })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /right wall panel/i })).not.toBeInTheDocument();
  });

  it('opens the piece detail when a row is clicked', async () => {
    const user = userEvent.setup();
    const project = await seedLabelledPieces();
    await renderInventory(project.id);

    await user.click(await screen.findByRole('row', { name: /left wall panel/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Piece details')).toBeInTheDocument();
    expect(within(dialog).getByText('Left wall panel')).toBeInTheDocument();
  });

  it('opens the piece detail with Enter on a focused row', async () => {
    const user = userEvent.setup();
    const project = await seedLabelledPieces();
    await renderInventory(project.id);

    const row = await screen.findByRole('row', { name: /left wall panel/i });
    row.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog')).toHaveTextContent(/piece details/i);
  });

  it('keeps Edit isolated from the row click', async () => {
    const user = userEvent.setup();
    const project = await seedLabelledPieces();
    await renderInventory(project.id);

    const row = await screen.findByRole('row', { name: /left wall panel/i });
    await user.click(within(row).getByRole('button', { name: /edit piece/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/edit piece/i);
    expect(screen.queryByText(/piece details/i)).not.toBeInTheDocument();
  });
});

describe('ProjectInventoryScreen resilience and empty states', () => {
  it('shows a load error and retries', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Retry Site' });
    failNextGetActivePieces();

    await renderInventory(project.id);

    expect(await screen.findByText(/could not load inventory/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText(/no pieces in inventory yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load inventory/i)).not.toBeInTheDocument();
  });

  it('offers one Add piece CTA in the true-empty state', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Empty Site' });
    await renderInventory(project.id);

    expect(await screen.findByText(/no pieces in inventory yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add piece/i })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /add piece/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders inventory as cards on mobile', async () => {
    const user = userEvent.setup();
    useMobileViewport();
    const project = await seedProject({ name: 'Mobile Inventory Site' });
    await addPiece({
      projectId: project.id,
      materialType: 'lumber',
      length: 3.6,
      crossSection: '2x3',
      storageLocation: 'Rack C',
    });

    await renderInventory(project.id);

    const list = await screen.findByTestId('piece-cards');
    expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    expect(within(list).getByRole('listitem')).toHaveTextContent(/3\.60 m · 2x3/i);
    expect(within(list).getByRole('listitem')).toHaveTextContent(/rack c/i);
    expect(
      within(list).getByRole('button', { name: /view piece/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /open piece/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/piece details/i);
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
    const stored = await getPiece(project.id, piece.id);
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
    const stored = await getPiece(project.id, piece.id);
    expect(stored).toMatchObject({ retired: true, condition: 'Retired', usageCount: 5 });
    expect(await getUsageLog(project.id, piece.id)).toHaveLength(5);
    expect(await retirePiece(project.id, piece.id)).toMatchObject({ retired: true });
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
    await screen.findByText(/no pieces in inventory yet/i);

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

  it('clears filters from the no-match state', async () => {
    const user = userEvent.setup();
    const { project } = await seedInventory();
    await renderInventory(project.id);
    await screen.findByRole('row', { name: /rack a/i });

    await user.type(screen.getByLabelText(/search inventory/i), 'does-not-exist');

    expect(await screen.findByText(/no pieces match your filters/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(await screen.findByRole('row', { name: /rack a/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search inventory/i)).toHaveValue('');
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
