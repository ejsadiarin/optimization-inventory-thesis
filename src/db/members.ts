import { getDoc, getDocs, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { generateId } from '@/lib/ids';
import {
  dataWithId,
  projectCollection,
  projectDoc,
  requireProjectId,
} from '@/lib/firestore-helpers';
import { LUMBER_CROSS_SECTIONS } from './types';
import type {
  CrossSection,
  LumberRequirement,
  StructuralMember,
  StructuralMemberType,
} from './types';

export { LUMBER_CROSS_SECTIONS };

export interface StructuralMemberInput {
  projectId: string;
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
}

export interface StructuralMemberFields {
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
}

export interface LumberRequirementInput {
  projectId: string;
  label: string;
  length: number;
  crossSection: CrossSection;
}

export interface LumberRequirementFields {
  label: string;
  length: number;
  crossSection: CrossSection;
}

export interface LumberRequirementGroup {
  crossSection: CrossSection;
  items: LumberRequirement[];
}

function normalizeMemberFields(fields: StructuralMemberFields): StructuralMemberFields {
  return {
    type: fields.type,
    label: fields.label.trim(),
    length: fields.length,
    width: fields.width,
    height: fields.type === 'slab' ? 0 : fields.height,
  };
}

function normalizeLumberFields(fields: LumberRequirementFields): LumberRequirementFields {
  return {
    label: fields.label.trim(),
    length: fields.length,
    crossSection: fields.crossSection,
  };
}

function byCreatedAt<T extends { createdAt: string }>(left: T, right: T): number {
  return left.createdAt.localeCompare(right.createdAt);
}

export async function createStructuralMember(
  input: StructuralMemberInput,
): Promise<StructuralMember> {
  const projectId = requireProjectId(input.projectId);
  const member: StructuralMember = {
    id: generateId(),
    projectId,
    ...normalizeMemberFields(input),
    createdAt: new Date().toISOString(),
  };

  await setDoc(projectDoc(projectId, 'structuralMembers', member.id), member);
  return member;
}

export async function listStructuralMembers(projectId: string): Promise<StructuralMember[]> {
  const snapshot = await getDocs(
    projectCollection(requireProjectId(projectId), 'structuralMembers'),
  );

  const members: StructuralMember[] = [];
  for (const document of snapshot.docs) {
    const member = dataWithId<StructuralMember>(document);
    if (member) members.push(member);
  }
  return members.sort(byCreatedAt);
}

export async function updateStructuralMember(
  projectId: string,
  id: string,
  fields: StructuralMemberFields,
): Promise<StructuralMember | undefined> {
  const reference = projectDoc(requireProjectId(projectId), 'structuralMembers', id);
  const existing = await getDoc(reference);
  if (!existing.exists()) return undefined;

  await updateDoc(reference, { ...normalizeMemberFields(fields) });

  const updated = await getDoc(reference);
  return dataWithId<StructuralMember>(updated);
}

export async function deleteStructuralMember(projectId: string, id: string): Promise<void> {
  await deleteDoc(projectDoc(requireProjectId(projectId), 'structuralMembers', id));
}

export async function createLumberRequirement(
  input: LumberRequirementInput,
): Promise<LumberRequirement> {
  const projectId = requireProjectId(input.projectId);
  const requirement: LumberRequirement = {
    id: generateId(),
    projectId,
    ...normalizeLumberFields(input),
    createdAt: new Date().toISOString(),
  };

  await setDoc(projectDoc(projectId, 'lumberRequirements', requirement.id), requirement);
  return requirement;
}

export async function listLumberRequirements(projectId: string): Promise<LumberRequirement[]> {
  const snapshot = await getDocs(
    projectCollection(requireProjectId(projectId), 'lumberRequirements'),
  );

  const requirements: LumberRequirement[] = [];
  for (const document of snapshot.docs) {
    const requirement = dataWithId<LumberRequirement>(document);
    if (requirement) requirements.push(requirement);
  }
  return requirements.sort(byCreatedAt);
}

export async function updateLumberRequirement(
  projectId: string,
  id: string,
  fields: LumberRequirementFields,
): Promise<LumberRequirement | undefined> {
  const reference = projectDoc(requireProjectId(projectId), 'lumberRequirements', id);
  const existing = await getDoc(reference);
  if (!existing.exists()) return undefined;

  await updateDoc(reference, { ...normalizeLumberFields(fields) });

  const updated = await getDoc(reference);
  return dataWithId<LumberRequirement>(updated);
}

export async function deleteLumberRequirement(projectId: string, id: string): Promise<void> {
  await deleteDoc(projectDoc(requireProjectId(projectId), 'lumberRequirements', id));
}

export function groupLumberRequirementsByCrossSection(
  requirements: LumberRequirement[],
): LumberRequirementGroup[] {
  return LUMBER_CROSS_SECTIONS.map((crossSection) => ({
    crossSection,
    items: requirements.filter((requirement) => requirement.crossSection === crossSection),
  })).filter((group) => group.items.length > 0);
}
