import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import {
  createLumberRequirement,
  createStructuralMember,
  listLumberRequirements,
  listStructuralMembers,
} from '@/db/members';
import { seedProject } from '@/test/fixtures';
import { failNextListStructuralMembers, resetMembersMock } from '@/test/membersMock';
import { resetViewport, useMobileViewport } from '@/test/viewport';

vi.mock('@/db/projects', () => import('@/test/dexieProjects'));
vi.mock('@/db/members', () => import('@/test/membersMock'));
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  resetMembersMock();
});

afterEach(() => {
  resetViewport();
});

async function renderMembers(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/members`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: /structural members/i });
}

describe('StructuralMembersScreen', () => {
  it('shows info hints on member and lumber card headers', async () => {
    const project = await seedProject({ name: 'Hints Site' });
    await renderMembers(project.id);

    expect(
      screen.getByRole('button', { name: 'About Members' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About Lumber requirements' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Column → 4 panels/),
    ).toBeInTheDocument();
  });

  it('adds a column and shows its decomposed panels', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    await renderMembers(project.id);
    await screen.findByText(/no structural members yet/i);

    await user.click(screen.getByRole('button', { name: /add member/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/member label/i), 'C1');
    await user.type(within(dialog).getByLabelText(/^length/i), '0.4');
    await user.type(within(dialog).getByLabelText(/^width/i), '0.25');
    await user.type(within(dialog).getByLabelText(/^height/i), '3');
    await user.click(within(dialog).getByRole('button', { name: /save member/i }));

    expect(await screen.findByText('C1')).toBeInTheDocument();
    const memberTable = screen.getByRole('table');
    expect(within(memberTable).getByText(/^4 panels$/)).toBeInTheDocument();
    expect(screen.getByText(/0\.40 m × 3\.00 m ×2/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.25 m × 3\.00 m ×2/i)).toBeInTheDocument();

    const members = await listStructuralMembers(project.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ label: 'C1', type: 'column', height: 3 });
  });

  it('edits an existing member', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'beam',
      label: 'B1',
      length: 4,
      width: 0.25,
      height: 0.5,
    });
    await renderMembers(project.id);

    await user.click(await screen.findByRole('button', { name: /edit B1/i }));

    const dialog = await screen.findByRole('dialog');
    const labelInput = within(dialog).getByLabelText(/member label/i);
    await user.clear(labelInput);
    await user.type(labelInput, 'B2');
    const lengthInput = within(dialog).getByLabelText(/^length/i);
    await user.clear(lengthInput);
    await user.type(lengthInput, '4.5');
    await user.click(within(dialog).getByRole('button', { name: /save member/i }));

    expect(await screen.findByText('B2')).toBeInTheDocument();
    expect(screen.getAllByText(/4\.50 m × 0\.25 m/i).length).toBeGreaterThan(0);

    const members = await listStructuralMembers(project.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ label: 'B2', length: 4.5 });
  });

  it('asks for confirmation before deleting a member', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });
    await renderMembers(project.id);

    await user.click(await screen.findByRole('button', { name: /delete S1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/delete S1\?/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('S1')).toBeInTheDocument();
    expect(await listStructuralMembers(project.id)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /delete S1/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /delete member/i,
      }),
    );

    expect(await screen.findByText(/no structural members yet/i)).toBeInTheDocument();
    expect(await listStructuralMembers(project.id)).toEqual([]);
  });

  it('shows a load error and retries', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    failNextListStructuralMembers();

    await renderMembers(project.id);

    expect(
      await screen.findByText(/could not load structural members/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText(/no structural members yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load structural members/i)).not.toBeInTheDocument();
  });

  it('renders members and lumber as cards on mobile', async () => {
    const project = await seedProject({ name: 'Members Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Brace A',
      length: 2.4,
      crossSection: '2x3',
    });
    useMobileViewport();

    await renderMembers(project.id);

    const memberCards = await screen.findByTestId('member-cards');
    expect(within(memberCards).getByText('C1')).toBeInTheDocument();
    expect(within(memberCards).getByText(/4 panels/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const lumberCards = screen.getByTestId('lumber-cards-2x3');
    expect(within(lumberCards).getByText('Brace A')).toBeInTheDocument();
    expect(within(lumberCards).getByText(/2\.40 m/i)).toBeInTheDocument();
  });

  it('offers one primary action in each empty state', async () => {
    const project = await seedProject({ name: 'Members Site' });
    await renderMembers(project.id);

    expect(await screen.findByText(/no structural members yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add member/i })).toHaveLength(1);
    expect(screen.getByText(/no lumber requirements yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add lumber/i })).toHaveLength(1);
  });

  it('warns when a decomposed panel exceeds the stock sheet', async () => {
    const project = await seedProject({ name: 'Members Site' });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });

    await renderMembers(project.id);

    expect(await screen.findByRole('alert')).toHaveTextContent(/manual tiling/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/S1/);
  });

  it('uses the project stock override when checking oversized panels', async () => {
    const project = await seedProject({
      name: 'Members Site',
      stock: { phenolic: { length: 6, width: 3.5, thickness: 0.018 } },
    });
    await createStructuralMember({
      projectId: project.id,
      type: 'slab',
      label: 'S1',
      length: 4,
      width: 3,
      height: 0,
    });

    await renderMembers(project.id);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds lumber requirements and groups them by cross-section', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Existing brace',
      length: 3,
      crossSection: '2x2',
    });
    await renderMembers(project.id);
    await screen.findByText('Existing brace');

    await user.click(screen.getByRole('button', { name: /add lumber/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/requirement label/i), 'Brace A');
    await user.type(within(dialog).getByLabelText(/^length/i), '2.4');
    await user.click(within(dialog).getByRole('combobox', { name: /cross-section/i }));
    await user.click(await screen.findByRole('option', { name: '2×4' }));
    await user.click(within(dialog).getByRole('button', { name: /save requirement/i }));

    expect(await screen.findByRole('heading', { name: /2×2/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /2×4/i })).toBeInTheDocument();
    expect(screen.getByText('Existing brace')).toBeInTheDocument();
    expect(screen.getByText('Brace A')).toBeInTheDocument();
  });

  it('links lumber to a member and preserves or updates the link when editing', async () => {
    const user = userEvent.setup();
    const project = await seedProject({ name: 'Members Site' });
    const member = await createStructuralMember({
      projectId: project.id,
      type: 'column',
      label: 'C1',
      length: 0.4,
      width: 0.25,
      height: 3,
    });
    await renderMembers(project.id);
    await screen.findByText('C1');

    await user.click(screen.getByRole('button', { name: /add lumber/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/requirement label/i), 'Linked brace');
    await user.type(within(dialog).getByLabelText(/^length/i), '2.4');
    await user.click(
      within(dialog).getByRole('combobox', { name: /member \(optional\)/i }),
    );
    await user.click(await screen.findByRole('option', { name: /C1 · Column/i }));
    await user.click(within(dialog).getByRole('button', { name: /save requirement/i }));

    await screen.findByText('Linked brace');
    const lumberRow = screen.getByText('Linked brace').closest('tr');
    expect(lumberRow).not.toBeNull();
    expect(within(lumberRow as HTMLElement).getByText('C1')).toBeInTheDocument();

    const [stored] = await listLumberRequirements(project.id);
    expect(stored?.memberId).toBe(member.id);

    await user.click(screen.getByRole('button', { name: /edit lumber Linked brace/i }));
    const editDialog = await screen.findByRole('dialog');
    expect(
      within(editDialog).getByRole('combobox', { name: /member \(optional\)/i }),
    ).toHaveTextContent('C1 · Column');
    await user.click(
      within(editDialog).getByRole('combobox', { name: /member \(optional\)/i }),
    );
    await user.click(
      await screen.findByRole('option', { name: /project-level \(no member\)/i }),
    );
    await user.click(
      within(editDialog).getByRole('button', { name: /save requirement/i }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Project-level')).toBeInTheDocument();

    const [updated] = await listLumberRequirements(project.id);
    expect(updated?.memberId).toBeUndefined();
  });
});
