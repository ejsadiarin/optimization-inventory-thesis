import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { DEFAULT_TEST_COSTS, DEFAULT_TEST_STOCK } from '@/test/fixtures';

export const DEFAULT_COSTS = DEFAULT_TEST_COSTS;
export const DEFAULT_STOCK = DEFAULT_TEST_STOCK;

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.toArray();
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
