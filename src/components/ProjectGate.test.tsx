import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectGate from './ProjectGate';
import { makeProject } from '@/test/fixtures';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  verifyProjectAccess: vi.fn(),
}));

vi.mock('@/db/projects', () => ({
  getProject: mocks.getProject,
  verifyProjectAccess: mocks.verifyProjectAccess,
}));

beforeEach(() => {
  mocks.getProject.mockReset();
  mocks.verifyProjectAccess.mockReset();
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
    const project = makeProject({ name: 'Gated Site' });
    mocks.getProject.mockResolvedValue(project);
    mocks.verifyProjectAccess.mockResolvedValue(false);
    renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), 'WRONG1');
    await user.click(screen.getByRole('button', { name: /unlock project/i }));

    expect(await screen.findByText(/incorrect access code/i)).toBeInTheDocument();
    expect(screen.queryByText('Project Dashboard')).not.toBeInTheDocument();
  });

  it('opens the project when the correct access code is entered', async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: 'Gated Site' });
    mocks.getProject.mockResolvedValue(project);
    mocks.verifyProjectAccess.mockResolvedValue(true);
    renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), 'ABC123');
    await user.click(screen.getByRole('button', { name: /unlock project/i }));

    expect(await screen.findByText('Project Dashboard')).toBeInTheDocument();
    expect(mocks.verifyProjectAccess).toHaveBeenCalledWith(project.id, 'ABC123');
  });

  it('still asks the owner for the access code', async () => {
    const project = makeProject({ name: 'Owned Site', ownerId: 'test-user' });
    mocks.getProject.mockResolvedValue(project);
    renderGate(project.id);

    expect(await screen.findByLabelText(/access code/i)).toBeInTheDocument();
    expect(screen.queryByText('Project Dashboard')).not.toBeInTheDocument();
  });

  it('remembers the unlocked project for the session on remount', async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: 'Gated Site' });
    mocks.getProject.mockResolvedValue(project);
    mocks.verifyProjectAccess.mockResolvedValue(true);
    const { unmount } = renderGate(project.id);

    await user.type(await screen.findByLabelText(/access code/i), 'ABC123');
    await user.click(screen.getByRole('button', { name: /unlock project/i }));
    await screen.findByText('Project Dashboard');

    unmount();
    renderGate(project.id);

    expect(await screen.findByText('Project Dashboard')).toBeInTheDocument();
    expect(screen.queryByLabelText(/access code/i)).not.toBeInTheDocument();
  });

  it('does not flash the full-screen loader on a background refresh', async () => {
    const project = makeProject({ name: 'Gated Site' });
    mocks.getProject.mockResolvedValue(project);
    renderGate(project.id);
    await screen.findByLabelText(/access code/i);

    let resolveRefresh: (value: typeof project | undefined) => void = () => undefined;
    mocks.getProject.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mocks.getProject).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText(/loading project/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();

    await act(async () => {
      resolveRefresh(project);
    });
  });

  it('reports a missing project as unavailable online', async () => {
    mocks.getProject.mockResolvedValue(undefined);
    renderGate('missing-project');

    expect(await screen.findByText(/not available online/i)).toBeInTheDocument();
  });
});
