import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProjectsScreen from './ProjectsScreen';
import { TestAuthProvider, testUser } from '@/test/auth';
import { makeProject, type ProjectOverrides } from '@/test/fixtures';
import type { Project } from '@/db/types';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock('@/db/projects', () => ({
  createProject: mocks.createProject,
  listProjects: mocks.listProjects,
}));

beforeEach(() => {
  mocks.createProject.mockReset();
  mocks.listProjects.mockReset();
  localStorage.setItem('formwork.firestore-migration.v1', 'done');
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TestAuthProvider user={testUser}>
        <ProjectsScreen />
      </TestAuthProvider>
    </MemoryRouter>,
  );
}

function project(overrides: ProjectOverrides = {}): Project {
  return makeProject(overrides);
}

describe('ProjectsScreen', () => {
  it('creates a project, reveals a one-time access code, and lists the project', async () => {
    const user = userEvent.setup();
    const created = project({ name: 'Two-Storey Residence', ownerName: testUser.displayName });
    mocks.listProjects.mockResolvedValueOnce([]).mockResolvedValue([created]);
    mocks.createProject.mockResolvedValue({ project: created, accessCode: 'ABC123' });

    renderScreen();

    await user.click(await screen.findByRole('button', { name: /new project/i }));
    await user.type(screen.getByLabelText(/project name/i), 'Two-Storey Residence');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByTestId('access-code')).toHaveTextContent('ABC123');
    expect(mocks.createProject).toHaveBeenCalledWith(
      { name: 'Two-Storey Residence' },
      { uid: testUser.uid, name: testUser.displayName },
    );

    await user.click(screen.getByRole('button', { name: /saved the code/i }));

    expect(await screen.findByText('Two-Storey Residence')).toBeInTheDocument();
  });

  it('shows an empty state before any project exists', async () => {
    mocks.listProjects.mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('shows each owner and marks only projects created by the current account as Mine', async () => {
    const mine = project({
      name: 'Mine Site',
      ownerId: testUser.uid,
      ownerName: testUser.displayName,
    });
    const shared = project({ name: 'Shared Site', ownerId: 'other-uid', ownerName: 'Other Engineer' });
    mocks.listProjects.mockResolvedValue([shared, mine]);

    renderScreen();

    expect(await screen.findByText('Mine Site')).toBeInTheDocument();
    expect(screen.getByText('Shared Site')).toBeInTheDocument();
    expect(screen.getByText(testUser.displayName)).toBeInTheDocument();
    expect(screen.getByText('Other Engineer')).toBeInTheDocument();
    expect(screen.getAllByText('Mine')).toHaveLength(1);
    expect(screen.getAllByText('Locked')).toHaveLength(2);
  });

  it('shows a load error when the marketplace cannot be read', async () => {
    mocks.listProjects.mockRejectedValue(new Error('permission denied'));
    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load projects/i);
  });

  it('refetches the marketplace when the window regains focus', async () => {
    mocks.listProjects.mockResolvedValue([]);
    renderScreen();
    await screen.findByText(/no projects yet/i);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    });
  });

  it('does not offer the demo-data action', async () => {
    mocks.listProjects.mockResolvedValue([]);
    renderScreen();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load demo data/i })).not.toBeInTheDocument();
    });
  });
});
