import { generateId } from '@/lib/ids';
import { db } from './db';
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

export async function createStructuralMember(
  input: StructuralMemberInput,
): Promise<StructuralMember> {
  const member: StructuralMember = {
    id: generateId(),
    projectId: input.projectId,
    ...normalizeMemberFields(input),
    createdAt: new Date().toISOString(),
  };

  await db.structuralMembers.add(member);
  return member;
}

export async function listStructuralMembers(projectId: string): Promise<StructuralMember[]> {
  return db.structuralMembers.where('projectId').equals(projectId).sortBy('createdAt');
}

export async function updateStructuralMember(
  id: string,
  fields: StructuralMemberFields,
): Promise<StructuralMember | undefined> {
  const updated = await db.structuralMembers.update(id, normalizeMemberFields(fields));
  if (!updated) return undefined;
  return db.structuralMembers.get(id);
}

export async function deleteStructuralMember(id: string): Promise<void> {
  await db.structuralMembers.delete(id);
}

export async function createLumberRequirement(
  input: LumberRequirementInput,
): Promise<LumberRequirement> {
  const requirement: LumberRequirement = {
    id: generateId(),
    projectId: input.projectId,
    ...normalizeLumberFields(input),
    createdAt: new Date().toISOString(),
  };

  await db.lumberRequirements.add(requirement);
  return requirement;
}

export async function listLumberRequirements(projectId: string): Promise<LumberRequirement[]> {
  return db.lumberRequirements.where('projectId').equals(projectId).sortBy('createdAt');
}

export async function updateLumberRequirement(
  id: string,
  fields: LumberRequirementFields,
): Promise<LumberRequirement | undefined> {
  const updated = await db.lumberRequirements.update(id, normalizeLumberFields(fields));
  if (!updated) return undefined;
  return db.lumberRequirements.get(id);
}

export async function deleteLumberRequirement(id: string): Promise<void> {
  await db.lumberRequirements.delete(id);
}

export function groupLumberRequirementsByCrossSection(
  requirements: LumberRequirement[],
): LumberRequirementGroup[] {
  return LUMBER_CROSS_SECTIONS.map((crossSection) => ({
    crossSection,
    items: requirements.filter((requirement) => requirement.crossSection === crossSection),
  })).filter((group) => group.items.length > 0);
}
