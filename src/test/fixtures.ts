import type { Project, ProjectCosts, ProjectStock } from '@/db/types';
import { generateId } from '@/lib/ids';

export const DEFAULT_TEST_COSTS: ProjectCosts = {
  phenolicPerSheet: 850,
  lumberPerPiece: 120,
};

export const DEFAULT_TEST_STOCK: ProjectStock = {
  phenolic: { length: 2.44, width: 1.22 },
  lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
};

export type ProjectOverrides = Omit<Partial<Project>, 'costs' | 'stock'> & {
  costs?: Partial<ProjectCosts>;
  stock?: Partial<ProjectStock>;
};

export function makeProject(overrides: ProjectOverrides = {}): Project {
  const { costs, stock, ...rest } = overrides;

  return {
    id: generateId(),
    name: 'Test Project',
    ownerId: 'test-user',
    ownerName: 'Demo Engineer',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    costs: { ...DEFAULT_TEST_COSTS, ...costs },
    stock: {
      phenolic: { ...DEFAULT_TEST_STOCK.phenolic, ...stock?.phenolic },
      lumberLengths: [...(stock?.lumberLengths ?? DEFAULT_TEST_STOCK.lumberLengths)],
    },
    ...rest,
  };
}

export async function seedProject(overrides: ProjectOverrides = {}): Promise<Project> {
  const project = makeProject(overrides);
  const { db } = await import('@/db/db');
  await db.projects.add(project);
  return project;
}
