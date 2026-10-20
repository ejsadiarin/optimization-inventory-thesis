import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  DEFAULT_COSTS,
  DEFAULT_STOCK,
  createProject,
  getProject,
  listProjects,
  updateProjectSettings,
  verifyProjectAccess,
} from './projects';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('project store', () => {
  it('creates a project with a six-character uppercase access code', async () => {
    const project = await createProject({ name: 'Two-Storey Residence' });

    expect(project.accessCode).toMatch(/^[A-Z]{6}$/);
  });

  it('applies default material costs and stock sizes to a new project', async () => {
    const project = await createProject({ name: 'Default Site' });

    expect(project.costs).toEqual({ phenolicPerSheet: 850, lumberPerPiece: 120 });
    expect(project.stock).toEqual({
      phenolic: { length: 2.44, width: 1.22 },
      lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
    });
    expect(DEFAULT_COSTS.phenolicPerSheet).toBe(850);
    expect(DEFAULT_STOCK.phenolic).toEqual({ length: 2.44, width: 1.22 });
  });

  it('persists created projects so they can be retrieved and listed', async () => {
    const first = await createProject({ name: 'Alpha Site' });
    const second = await createProject({ name: 'Beta Site' });

    await expect(getProject(first.id)).resolves.toMatchObject({ name: 'Alpha Site' });

    const projects = await listProjects();
    expect(projects.map((project) => project.name).sort()).toEqual(['Alpha Site', 'Beta Site']);
    expect(projects).toHaveLength(2);
    expect(projects.find((project) => project.id === second.id)).toBeDefined();
  });

  it('accepts the correct access code and rejects a wrong one', async () => {
    const project = await createProject({ name: 'Gated Site' });

    await expect(verifyProjectAccess(project.id, project.accessCode)).resolves.toBe(true);
    await expect(verifyProjectAccess(project.id, project.accessCode.toLowerCase())).resolves.toBe(true);
    await expect(verifyProjectAccess(project.id, ` ${project.accessCode} `)).resolves.toBe(true);
    await expect(verifyProjectAccess(project.id, 'WRONG1')).resolves.toBe(false);
    await expect(verifyProjectAccess('missing-project', project.accessCode)).resolves.toBe(false);
  });

  it('updates and persists project cost and stock settings', async () => {
    const project = await createProject({ name: 'Custom Site' });

    await updateProjectSettings(project.id, {
      costs: { phenolicPerSheet: 920, lumberPerPiece: 145 },
      stock: { phenolic: { length: 2.5, width: 1.25 }, lumberLengths: [3.0, 4.5] },
    });

    const updated = await getProject(project.id);
    expect(updated?.costs).toEqual({ phenolicPerSheet: 920, lumberPerPiece: 145 });
    expect(updated?.stock).toEqual({
      phenolic: { length: 2.5, width: 1.25 },
      lumberLengths: [3.0, 4.5],
    });
  });

  it('keeps each project settings independent', async () => {
    const first = await createProject({ name: 'First Site' });
    const second = await createProject({ name: 'Second Site' });

    await updateProjectSettings(first.id, {
      costs: { phenolicPerSheet: 1000, lumberPerPiece: 150 },
      stock: { phenolic: { length: 2.0, width: 1.0 }, lumberLengths: [3.0] },
    });

    const untouched = await getProject(second.id);
    expect(untouched?.costs).toEqual(DEFAULT_COSTS);
    expect(untouched?.stock).toEqual(DEFAULT_STOCK);
  });
});
