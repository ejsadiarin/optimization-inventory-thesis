import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { makeProject } from '@/test/fixtures';
import type { Project, ProjectCosts, ProjectStock } from '@/db/types';
import { unlockProject } from '@/lib/projectSession';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProjectSettings: vi.fn(),
}));

vi.mock('@/db/projects', async () => {
  const { DEFAULT_TEST_COSTS, DEFAULT_TEST_STOCK } = await import('@/test/fixtures');
  return {
    DEFAULT_COSTS: DEFAULT_TEST_COSTS,
    DEFAULT_STOCK: DEFAULT_TEST_STOCK,
    createProject: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: mocks.getProject,
    verifyProjectAccess: vi.fn(),
    updateProjectSettings: mocks.updateProjectSettings,
  };
});

beforeEach(() => {
  mocks.getProject.mockReset();
  mocks.updateProjectSettings.mockReset();
});

async function renderSettings(project: Project) {
  mocks.getProject.mockResolvedValue(project);
  unlockProject(project.id);
  render(
    <MemoryRouter initialEntries={[`/projects/${project.id}/settings`]}>
      <TestAuthProvider user={testUser}>
        <App />
      </TestAuthProvider>
    </MemoryRouter>,
  );
  await screen.findByLabelText(/phenolic board cost/i);
}

describe('ProjectSettingsScreen', () => {
  it('shows the standard default costs and stock sizes', async () => {
    const project = makeProject({ name: 'Settings Site' });
    await renderSettings(project);

    expect(screen.getByLabelText(/phenolic board cost/i)).toHaveValue(850);
    expect(screen.getByLabelText(/lumber cost/i)).toHaveValue(120);
    expect(screen.getByLabelText(/stock sheet length/i)).toHaveValue(2.44);
    expect(screen.getByLabelText(/stock sheet width/i)).toHaveValue(1.22);
    expect(screen.getByRole('spinbutton', { name: /lumber stock length 1/i })).toHaveValue(2.4);
    expect(screen.getByRole('spinbutton', { name: /lumber stock length 5/i })).toHaveValue(6);
  });

  it('saves edited material costs and stock sizes to the Firestore project', async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: 'Settings Site' });
    mocks.updateProjectSettings.mockImplementation(
      async (_id: string, settings: { costs: ProjectCosts; stock: ProjectStock }) => ({
        ...project,
        costs: settings.costs,
        stock: settings.stock,
      }),
    );
    await renderSettings(project);

    const phenolicCost = screen.getByLabelText(/phenolic board cost/i);
    await user.clear(phenolicCost);
    await user.type(phenolicCost, '920');

    const sheetLength = screen.getByLabelText(/stock sheet length/i);
    await user.clear(sheetLength);
    await user.type(sheetLength, '3');

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
    expect(mocks.updateProjectSettings).toHaveBeenCalledWith(project.id, {
      costs: { phenolicPerSheet: 920, lumberPerPiece: 120 },
      stock: { phenolic: { length: 3, width: 1.22 }, lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0] },
    });
  });

  it('shows a save error instead of silently swallowing a failed write', async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: 'Settings Site' });
    mocks.updateProjectSettings.mockRejectedValue(new Error('offline'));
    await renderSettings(project);

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save settings/i);
    expect(screen.queryByText(/settings saved/i)).not.toBeInTheDocument();
  });

  it('shows a save error when the project no longer exists online', async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: 'Settings Site' });
    mocks.updateProjectSettings.mockResolvedValue(undefined);
    await renderSettings(project);

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not available online/i);
  });
});
