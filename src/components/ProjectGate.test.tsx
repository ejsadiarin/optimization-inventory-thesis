import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectGate from './ProjectGate';
import { db } from '@/db/db';
import { createProject } from '@/db/projects';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function renderGate(projectId: string) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectGate />}>
          <Route index element={<div>Project Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectGate', () => {
  it('rejects a wrong access code and keeps the project locked', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Gated Site' });
    renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), 'WRONG1');
    await user.click(screen.getByRole('button', { name: /unlock project/i }));

    expect(await screen.findByText(/incorrect access code/i)).toBeInTheDocument();
    expect(screen.queryByText('Project Dashboard')).not.toBeInTheDocument();
  });

  it('opens the project when the correct access code is entered', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Gated Site' });
    renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), project.accessCode);
    await user.click(screen.getByRole('button', { name: /unlock project/i }));

    expect(await screen.findByText('Project Dashboard')).toBeInTheDocument();
  });

  it('remembers the unlocked project for the session on remount', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Gated Site' });
    const { unmount } = renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), project.accessCode);
    await user.click(screen.getByRole('button', { name: /unlock project/i }));
    await screen.findByText('Project Dashboard');

    unmount();
    renderGate(project.id);

    expect(await screen.findByText('Project Dashboard')).toBeInTheDocument();
    expect(screen.queryByLabelText(/access code/i)).not.toBeInTheDocument();
  });
});
