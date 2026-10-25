import { db } from '@/migration/legacyDb';
import type { LegacyProject } from '@/migration/legacyTypes';
import type { Project } from '@/db/types';
import { DEFAULT_TEST_COSTS, DEFAULT_TEST_STOCK } from '@/test/fixtures';

export const DEFAULT_COSTS = DEFAULT_TEST_COSTS;
export const DEFAULT_STOCK = DEFAULT_TEST_STOCK;

function toProject(legacy: LegacyProject): Project {
  return {
    id: legacy.id,
    name: legacy.name,
    ownerId: 'test-user',
    ownerName: 'Demo Engineer',
    schemaVersion: 1,
    createdAt: legacy.createdAt,
    costs: legacy.costs,
    stock: legacy.stock,
  };
}

export async function getProject(id: string): Promise<Project | undefined> {
  const legacy = await db.projects.get(id);
  return legacy ? toProject(legacy) : undefined;
}

export async function listProjects(): Promise<Project[]> {
  const legacies = await db.projects.toArray();
  return legacies.map(toProject);
}

export async function verifyProjectAccess(): Promise<boolean> {
  return false;
}

export async function createProject(): Promise<never> {
  throw new Error('createProject is not used by this test.');
}

export async function updateProjectSettings(): Promise<undefined> {
  return undefined;
}
