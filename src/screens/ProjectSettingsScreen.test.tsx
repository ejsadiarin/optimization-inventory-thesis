import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { db } from '@/db/db';
import { createProject, getProject } from '@/db/projects';
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function renderSettings(projectId: string) {
  unlockProject(projectId);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/settings`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByLabelText(/phenolic board cost/i);
}

describe('ProjectSettingsScreen', () => {
  it('shows the standard default costs and stock sizes', async () => {
    const project = await createProject({ name: 'Settings Site' });
    await renderSettings(project.id);

    expect(screen.getByLabelText(/phenolic board cost/i)).toHaveValue(850);
    expect(screen.getByLabelText(/lumber cost/i)).toHaveValue(120);
    expect(screen.getByLabelText(/stock sheet length/i)).toHaveValue(2.44);
    expect(screen.getByLabelText(/stock sheet width/i)).toHaveValue(1.22);
    expect(screen.getByRole('spinbutton', { name: /lumber stock length 1/i })).toHaveValue(2.4);
    expect(screen.getByRole('spinbutton', { name: /lumber stock length 5/i })).toHaveValue(6);
  });

  it('saves edited material costs and stock sizes to the project', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Settings Site' });
    await renderSettings(project.id);

    const phenolicCost = screen.getByLabelText(/phenolic board cost/i);
    await user.clear(phenolicCost);
    await user.type(phenolicCost, '920');

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
    const updated = await getProject(project.id);
    expect(updated?.costs.phenolicPerSheet).toBe(920);
  });
});
