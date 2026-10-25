import { setDoc } from 'firebase/firestore';
import { generateAccessCodeSalt, hashAccessCode } from '@/lib/access-code';
import { projectRef, requireProjectId } from '@/lib/firestore-helpers';
import { DEFAULT_COSTS, DEFAULT_STOCK, getProject } from './projects';
import { createStructuralMember, createLumberRequirement } from './members';
import { addPiece, recordUsage, retirePiece } from './inventory';
import { saveCuttingPlanSnapshot } from './plans';
import { decomposeMember } from '@/engine/decompose';
import type { Project, ProjectOwner } from './types';
import type { CreatedProject } from './types';

export const DEMO_PROJECT_NAME = 'Demo — Two-Storey Residence';
export const DEMO_ACCESS_CODE = 'DEMO01';
export const DEMO_PROJECT_ID = 'demo-project';

const SCHEMA_VERSION = 1;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Partial-failure note: if a seed fails midway, the fixed id may leave an
// incomplete demo project. There is no automatic repair in v1; delete the
// demo-project document's subcollections in the console to retry.
export async function seedDemoProject(owner: ProjectOwner): Promise<CreatedProject> {
  const existing = await getProject(DEMO_PROJECT_ID);
  if (existing) {
    return { project: existing, accessCode: DEMO_ACCESS_CODE };
  }

  const salt = generateAccessCodeSalt();
  const accessCodeHash = await hashAccessCode(DEMO_ACCESS_CODE, salt);
  const project: Project = {
    id: DEMO_PROJECT_ID,
    name: DEMO_PROJECT_NAME,
    ownerId: owner.uid,
    ownerName: owner.name,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    costs: { ...DEFAULT_COSTS },
    stock: {
      phenolic: { ...DEFAULT_STOCK.phenolic },
      lumberLengths: [...DEFAULT_STOCK.lumberLengths],
    },
  };

  await setDoc(projectRef(requireProjectId(project.id)), {
    ...project,
    accessCodeHash,
    accessCodeSalt: salt,
  });

  const c1 = await createStructuralMember({
    projectId: project.id,
    type: 'column',
    label: 'C1',
    length: 0.3,
    width: 0.3,
    height: 2.2,
  });
  const c2 = await createStructuralMember({
    projectId: project.id,
    type: 'column',
    label: 'C2',
    length: 0.3,
    width: 0.3,
    height: 2.2,
  });
  const b1 = await createStructuralMember({
    projectId: project.id,
    type: 'beam',
    label: 'B1',
    length: 2,
    width: 0.2,
    height: 0.4,
  });
  await createStructuralMember({
    projectId: project.id,
    type: 'beam',
    label: 'B2',
    length: 3,
    width: 0.2,
    height: 0.4,
  });
  const s1 = await createStructuralMember({
    projectId: project.id,
    type: 'slab',
    label: 'S1',
    length: 1.2,
    width: 0.9,
    height: 0,
  });
  await createStructuralMember({
    projectId: project.id,
    type: 'slab',
    label: 'S2',
    length: 3,
    width: 2,
    height: 0,
  });

  const braceA = await createLumberRequirement({
    projectId: project.id,
    label: 'B1 brace left',
    length: 2.2,
    crossSection: '2x3',
  });
  await createLumberRequirement({
    projectId: project.id,
    label: 'B1 brace right',
    length: 2.2,
    crossSection: '2x3',
  });
  await createLumberRequirement({
    projectId: project.id,
    label: 'C1 kicker',
    length: 1.2,
    crossSection: '2x3',
  });
  const joist = await createLumberRequirement({
    projectId: project.id,
    label: 'S1 joist',
    length: 1.8,
    crossSection: '2x4',
  });
  await createLumberRequirement({
    projectId: project.id,
    label: 'C2 cleat',
    length: 0.8,
    crossSection: '2x2',
  });

  await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 2.44,
    width: 1.22,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack A',
    dateAdded: daysAgo(14),
    source: 'Supplier delivery',
  });
  await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 1.2,
    width: 0.6,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack B',
    dateAdded: daysAgo(9),
    source: 'Previous cut offcut',
  });
  const reusedPanel = await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 0.3,
    width: 2.2,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack A',
    dateAdded: daysAgo(7),
    source: 'Previous cut offcut',
  });

  const inspectedPanel = await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 0.6,
    width: 0.9,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack C',
    dateAdded: daysAgo(20),
    source: 'Previous cut offcut',
  });
  for (let use = 5; use >= 1; use -= 1) {
    await recordUsage(inspectedPanel.id, project.id, s1.label, daysAgo(use * 3));
  }

  await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 0.4,
    width: 0.5,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack C',
    dateAdded: daysAgo(3),
    source: 'Previous cut offcut',
  });

  const retiredPanel = await addPiece({
    projectId: project.id,
    materialType: 'phenolic',
    length: 1,
    width: 0.8,
    thickness: 0.018,
    condition: 'Good',
    storageLocation: 'Rack D',
    dateAdded: daysAgo(30),
    source: 'Previous cut offcut',
  });
  await retirePiece(project.id, retiredPanel.id);

  const reusedLumber = await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 3,
    crossSection: '2x3',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(8),
    source: 'Supplier delivery',
  });
  const wornLumber = await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 3,
    crossSection: '2x3',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(12),
    source: 'Previous use',
  });
  await recordUsage(wornLumber.id, project.id, b1.label, daysAgo(6));
  await recordUsage(wornLumber.id, project.id, c2.label, daysAgo(2));

  await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 4.8,
    crossSection: '2x4',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(10),
    source: 'Supplier delivery',
  });

  const inspectedLumber = await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 1.2,
    crossSection: '2x2',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(18),
    source: 'Previous use',
  });
  for (let use = 5; use >= 1; use -= 1) {
    await recordUsage(inspectedLumber.id, project.id, c2.label, daysAgo(use * 2));
  }

  await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 1,
    crossSection: '2x3',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(1),
    source: 'Previous use',
  });

  await recordUsage(reusedPanel.id, project.id, c1.label, daysAgo(1));
  await recordUsage(reusedLumber.id, project.id, braceA.label, daysAgo(1));

  const reusedPanelRequirement = decomposeMember(c1)[0]!;
  await saveCuttingPlanSnapshot(project.id, {
    satisfiedRequirementIds: [reusedPanelRequirement.id, braceA.id],
    acceptedByRequirement: {
      [reusedPanelRequirement.id]: reusedPanel.id,
      [braceA.id]: reusedLumber.id,
    },
  });

  const checked = await addPiece({
    projectId: project.id,
    materialType: 'lumber',
    length: 1.5,
    crossSection: '2x4',
    condition: 'Good',
    storageLocation: 'Lumber rack',
    dateAdded: daysAgo(4),
    source: 'Previous use',
  });
  await recordUsage(checked.id, project.id, joist.label, daysAgo(1));

  return { project, accessCode: DEMO_ACCESS_CODE };
}
