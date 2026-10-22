import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProjectsScreen from './ProjectsScreen';
import { db } from '@/db/db';
import { listProjects } from '@/db/projects';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ProjectsScreen />
    </MemoryRouter>,
  );
}

describe('ProjectsScreen', () => {
  it('creates a project, reveals a one-time access code, and lists the project', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /new project/i }));

    await user.type(screen.getByLabelText(/project name/i), 'Two-Storey Residence');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    const accessCode = await screen.findByTestId('access-code');
    expect(accessCode).toHaveTextContent(/^[A-Z]{6}$/);

    await user.click(screen.getByRole('button', { name: /saved the code/i }));

    await waitFor(async () => {
      expect(await listProjects()).toHaveLength(1);
    });
    expect(await screen.findByText('Two-Storey Residence')).toBeInTheDocument();
  });

  it('shows an empty state before any project exists', async () => {
    renderScreen();

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('loads a demo project and reveals its access code', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /load demo data/i }));

    expect(await screen.findByTestId('access-code')).toHaveTextContent('DEMO01');
    await user.click(screen.getByRole('button', { name: /saved the code/i }));

    expect(await screen.findByText('Demo — Two-Storey Residence')).toBeInTheDocument();
    await expect(listProjects()).resolves.toHaveLength(1);
  });
});
