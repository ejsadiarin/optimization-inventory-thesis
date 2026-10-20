import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { db } from '@/db/db';
import {
  createLumberRequirement,
  createStructuralMember,
  listStructuralMembers,
} from '@/db/members';
import { createProject } from '@/db/projects';
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderMembers(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/members`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: /structural members/i });
}

describe('StructuralMembersScreen', () => {
  it('adds a column and shows its decomposed panels', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Members Site' });
    await renderMembers(project.id);

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
    const project = await createProject({ name: 'Members Site' });
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

  it('deletes a member', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Members Site' });
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

    expect(await screen.findByText(/no structural members yet/i)).toBeInTheDocument();
    expect(await listStructuralMembers(project.id)).toEqual([]);
  });

  it('warns when a decomposed panel exceeds the stock sheet', async () => {
    const project = await createProject({ name: 'Members Site' });
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
    const project = await createProject({
      name: 'Members Site',
      stock: { phenolic: { length: 6, width: 3.5 } },
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
    const project = await createProject({ name: 'Members Site' });
    await createLumberRequirement({
      projectId: project.id,
      label: 'Existing brace',
      length: 3,
      crossSection: '2x2',
    });
    await renderMembers(project.id);

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
});
