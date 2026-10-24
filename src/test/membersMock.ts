import { generateId } from '@/lib/ids';
import { LUMBER_CROSS_SECTIONS } from '@/db/types';
import type {
  CrossSection,
  LumberRequirement,
  StructuralMember,
  StructuralMemberType,
} from '@/db/types';

interface StructuralMemberInput {
  projectId: string;
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
}

interface StructuralMemberFields {
  type: StructuralMemberType;
  label: string;
  length: number;
  width: number;
  height: number;
}

interface LumberRequirementInput {
  projectId: string;
  label: string;
  length: number;
  crossSection: CrossSection;
}

interface LumberRequirementFields {
  label: string;
  length: number;
  crossSection: CrossSection;
}

let members: StructuralMember[] = [];
let requirements: LumberRequirement[] = [];
let sequence = 0;

function nextCreatedAt(): string {
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, sequence)).toISOString();
  sequence += 1;
  return createdAt;
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

export function resetMembersMock(): void {
  members = [];
  requirements = [];
  sequence = 0;
}

export async function createStructuralMember(
  input: StructuralMemberInput,
): Promise<StructuralMember> {
  const member: StructuralMember = {
    id: generateId(),
    projectId: input.projectId,
    ...normalizeMemberFields(input),
    createdAt: nextCreatedAt(),
  };
  members.push(member);
  return member;
}

export async function listStructuralMembers(projectId: string): Promise<StructuralMember[]> {
  return members
    .filter((member) => member.projectId === projectId)
    .sort(byCreatedAt);
}

export async function updateStructuralMember(
  projectId: string,
  id: string,
  fields: StructuralMemberFields,
): Promise<StructuralMember | undefined> {
  const index = members.findIndex(
    (member) => member.id === id && member.projectId === projectId,
  );
  if (index === -1) return undefined;

  const updated: StructuralMember = {
    ...members[index]!,
    ...normalizeMemberFields(fields),
  };
  members[index] = updated;
  return updated;
}

export async function deleteStructuralMember(projectId: string, id: string): Promise<void> {
  members = members.filter(
    (member) => !(member.id === id && member.projectId === projectId),
  );
}

export async function createLumberRequirement(
  input: LumberRequirementInput,
): Promise<LumberRequirement> {
  const requirement: LumberRequirement = {
    id: generateId(),
    projectId: input.projectId,
    ...normalizeLumberFields(input),
    createdAt: nextCreatedAt(),
  };
  requirements.push(requirement);
  return requirement;
}

export async function listLumberRequirements(
  projectId: string,
): Promise<LumberRequirement[]> {
  return requirements
    .filter((requirement) => requirement.projectId === projectId)
    .sort(byCreatedAt);
}

export async function updateLumberRequirement(
  projectId: string,
  id: string,
  fields: LumberRequirementFields,
): Promise<LumberRequirement | undefined> {
  const index = requirements.findIndex(
    (requirement) => requirement.id === id && requirement.projectId === projectId,
  );
  if (index === -1) return undefined;

  const updated: LumberRequirement = {
    ...requirements[index]!,
    ...normalizeLumberFields(fields),
  };
  requirements[index] = updated;
  return updated;
}

export async function deleteLumberRequirement(
  projectId: string,
  id: string,
): Promise<void> {
  requirements = requirements.filter(
    (requirement) => !(requirement.id === id && requirement.projectId === projectId),
  );
}

export { LUMBER_CROSS_SECTIONS };

export function groupLumberRequirementsByCrossSection(
  requirementList: LumberRequirement[],
) {
  return LUMBER_CROSS_SECTIONS.map((crossSection) => ({
    crossSection,
    items: requirementList.filter(
      (requirement) => requirement.crossSection === crossSection,
    ),
  })).filter((group) => group.items.length > 0);
}
