import { db } from './db';
import type { Project, ProjectCosts, ProjectStock } from './types';
import { generateAccessCode, generateId, normalizeAccessCode } from '@/lib/ids';

export const DEFAULT_COSTS: ProjectCosts = {
  phenolicPerSheet: 850,
  lumberPerPiece: 120,
};

export const DEFAULT_STOCK: ProjectStock = {
  phenolic: { length: 2.44, width: 1.22 },
  lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
};

export interface CreateProjectInput {
  name: string;
  costs?: Partial<ProjectCosts>;
  stock?: Partial<ProjectStock>;
}

export interface ProjectSettingsInput {
  costs: ProjectCosts;
  stock: ProjectStock;
}

function copyCosts(costs: Partial<ProjectCosts> = {}): ProjectCosts {
  return {
    phenolicPerSheet: costs.phenolicPerSheet ?? DEFAULT_COSTS.phenolicPerSheet,
    lumberPerPiece: costs.lumberPerPiece ?? DEFAULT_COSTS.lumberPerPiece,
  };
}

function copyStock(stock: Partial<ProjectStock> = {}): ProjectStock {
  return {
    phenolic: {
      length: stock.phenolic?.length ?? DEFAULT_STOCK.phenolic.length,
      width: stock.phenolic?.width ?? DEFAULT_STOCK.phenolic.width,
    },
    lumberLengths: [...(stock.lumberLengths ?? DEFAULT_STOCK.lumberLengths)],
  };
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const project: Project = {
    id: generateId(),
    name: input.name.trim(),
    accessCode: generateAccessCode(),
    createdAt: new Date().toISOString(),
    costs: copyCosts(input.costs),
    stock: copyStock(input.stock),
  };

  await db.projects.add(project);
  return project;
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('createdAt').reverse().toArray();
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function verifyProjectAccess(id: string, code: string): Promise<boolean> {
  const project = await db.projects.get(id);
  if (!project) return false;
  return normalizeAccessCode(project.accessCode) === normalizeAccessCode(code);
}

export async function updateProjectSettings(
  id: string,
  settings: ProjectSettingsInput,
): Promise<Project | undefined> {
  const updated = await db.projects.update(id, {
    costs: copyCosts(settings.costs),
    stock: copyStock(settings.stock),
  });

  if (!updated) return undefined;
  return db.projects.get(id);
}
