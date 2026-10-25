import { collection, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateAccessCode, generateId } from '@/lib/ids';
import { queueWrite } from '@/lib/syncStatus';
import {
  generateAccessCodeSalt,
  hashAccessCode,
  verifyAccessCode,
} from '@/lib/access-code';
import { projectRef, requireProjectId } from '@/lib/firestore-helpers';
import type {
  CreatedProject,
  Project,
  ProjectCosts,
  ProjectOwner,
  ProjectStock,
} from './types';

export const DEFAULT_COSTS: ProjectCosts = {
  phenolicPerSheet: 850,
  lumberPerPiece: 120,
};

export const DEFAULT_STOCK: ProjectStock = {
  phenolic: { length: 2.44, width: 1.22 },
  lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0],
};

const SCHEMA_VERSION = 1;

interface StoredProject extends Project {
  accessCodeHash: string;
  accessCodeSalt: string;
}

export interface CreateProjectInput {
  name: string;
  costs?: Partial<ProjectCosts>;
  stock?: Partial<ProjectStock>;
}

export interface ProjectSettingsInput {
  costs: ProjectCosts;
  stock: ProjectStock;
}

function requireDb() {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  return db;
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

function toPublicProject(stored: StoredProject): Project {
  return {
    id: stored.id,
    name: stored.name,
    ownerId: stored.ownerId,
    ownerName: stored.ownerName,
    schemaVersion: stored.schemaVersion,
    createdAt: stored.createdAt,
    costs: stored.costs,
    stock: stored.stock,
  };
}

function toStoredProject(id: string, data: Record<string, unknown>): StoredProject {
  return { ...data, id } as StoredProject;
}

async function getStoredProject(id: string): Promise<StoredProject | undefined> {
  const snapshot = await getDoc(projectRef(requireProjectId(id)));
  if (!snapshot.exists()) return undefined;
  return toStoredProject(snapshot.id, snapshot.data());
}

export async function createProject(
  input: CreateProjectInput,
  owner: ProjectOwner,
): Promise<CreatedProject> {
  const accessCode = generateAccessCode();
  const accessCodeSalt = generateAccessCodeSalt();
  const accessCodeHash = await hashAccessCode(accessCode, accessCodeSalt);

  const project: Project = {
    id: generateId(),
    name: input.name.trim(),
    ownerId: owner.uid,
    ownerName: owner.name,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    costs: copyCosts(input.costs),
    stock: copyStock(input.stock),
  };

  queueWrite(
    setDoc(projectRef(project.id), {
      ...project,
      accessCodeHash,
      accessCodeSalt,
    }),
  );

  return { project, accessCode };
}

export async function listProjects(): Promise<Project[]> {
  const snapshot = await getDocs(collection(requireDb(), 'projects'));
  return snapshot.docs
    .map((document) => toPublicProject(toStoredProject(document.id, document.data())))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  const stored = await getStoredProject(id);
  return stored ? toPublicProject(stored) : undefined;
}

export async function verifyProjectAccess(id: string, code: string): Promise<boolean> {
  const stored = await getStoredProject(id);
  if (!stored) return false;
  return verifyAccessCode(code, stored.accessCodeSalt, stored.accessCodeHash);
}

export async function updateProjectSettings(
  id: string,
  settings: ProjectSettingsInput,
): Promise<Project | undefined> {
  const projectId = requireProjectId(id);
  const existing = await getStoredProject(projectId);
  if (!existing) return undefined;

  queueWrite(
    updateDoc(projectRef(projectId), {
      costs: copyCosts(settings.costs),
      stock: copyStock(settings.stock),
    }),
  );

  return getProject(projectId);
}
