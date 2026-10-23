import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestAuthProvider, testUser } from '@/test/auth';
import App from '@/App';
import { db } from '@/db/db';
import { createProject } from '@/db/projects';
import { unlockProject } from '@/lib/projectSession';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('ProjectOverviewScreen', () => {
  it('describes the modules that are available in the project', async () => {
    const project = await createProject({ name: 'Overview Site' });
    unlockProject(project.id);

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}`]}>
        <TestAuthProvider user={testUser}>
          <App />
        </TestAuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Overview Site' })).toBeInTheDocument();
    expect(screen.getByText(/project modules/i)).toBeInTheDocument();
    expect(screen.getByText(/structural members — define columns, beams, and slabs/i)).toBeInTheDocument();
    expect(screen.getByText(/inventory — track phenolic boards and lumber pieces/i)).toBeInTheDocument();
    expect(screen.getByText(/optimization — match reuse and plan cuts/i)).toBeInTheDocument();
    expect(screen.getByText(/summary — review utilization, waste, reuse, and savings/i)).toBeInTheDocument();
    expect(screen.getByText(/settings — adjust material costs and stock sizes/i)).toBeInTheDocument();
    expect(screen.queryByText(/upcoming tickets/i)).not.toBeInTheDocument();
  });
});
