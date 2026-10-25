import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { createHash, randomBytes } from 'node:crypto';

const email = 'demo@example.com';
const password = 'demo1234';
const displayName = 'Demo Engineer';
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? 'demo-test';
const DEMO_PROJECT_NAME = 'Demo — Two-Storey Residence';
const DEMO_ACCESS_CODE = 'DEMO01';
const DEMO_PROJECT_ID = 'demo-project';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function randomId() {
  return randomUUID();
}


async function hashAccessCode(code, saltHex) {
  const saltBytes = Buffer.from(saltHex, 'hex');
  const codeBytes = Buffer.from(code.trim().toUpperCase(), 'utf8');
  return createHash('sha256').update(Buffer.concat([saltBytes, codeBytes])).digest('hex');
}

function generateSalt() {
  return randomBytes(16).toString('hex');
}

async function ensureUser() {
  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`Demo user already exists: ${existing.email} (${existing.uid})`);
    return existing.uid;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({ email, password, displayName });
    console.log(`Created demo user: ${created.email} (${created.uid})`);
    return created.uid;
  }
}

async function main() {
  const uid = await ensureUser();

  const projectRef = db.collection('projects').doc(DEMO_PROJECT_ID);
  const existing = await projectRef.get();
  if (existing.exists) {
    console.log(`Demo project already exists (${DEMO_PROJECT_ID}); skipping.`);
    return;
  }

  const salt = generateSalt();
  const accessCodeHash = await hashAccessCode(DEMO_ACCESS_CODE, salt);

  await projectRef.set({
    id: DEMO_PROJECT_ID,
    name: DEMO_PROJECT_NAME,
    ownerId: uid,
    ownerName: displayName,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    costs: { phenolicPerSheet: 850, lumberPerPiece: 120 },
    stock: { phenolic: { length: 2.44, width: 1.22 }, lumberLengths: [2.4, 3.0, 3.6, 4.8, 6.0] },
    accessCodeHash,
    accessCodeSalt: salt,
  });

  const projectCol = (name) => projectRef.collection(name);

  // members
  const member = (type, label, length, width, height) => ({
    id: randomId(),
    projectId: DEMO_PROJECT_ID,
    type,
    label,
    length,
    width,
    height: type === 'slab' ? 0 : height,
    createdAt: new Date().toISOString(),
  });

  const c1 = member('column', 'C1', 0.3, 0.3, 2.2);
  const c2 = member('column', 'C2', 0.3, 0.3, 2.2);
  const b1 = member('beam', 'B1', 2, 0.2, 0.4);
  const b2 = member('beam', 'B2', 3, 0.2, 0.4);
  const s1 = member('slab', 'S1', 1.2, 0.9, 0);
  const s2 = member('slab', 'S2', 3, 2, 0);

  for (const m of [c1, c2, b1, b2, s1, s2]) {
    await projectCol('structuralMembers').doc(m.id).set(m);
  }

  // requirements
  const req = (label, length, crossSection) => ({
    id: randomId(),
    projectId: DEMO_PROJECT_ID,
    label,
    length,
    crossSection,
    createdAt: new Date().toISOString(),
  });

  const braceA = req('B1 brace left', 2.2, '2x3');
  const braceRight = req('B1 brace right', 2.2, '2x3');
  const c1Kicker = req('C1 kicker', 1.2, '2x3');
  const joist = req('S1 joist', 1.8, '2x4');
  const c2Cleat = req('C2 cleat', 0.8, '2x2');

  for (const r of [braceA, braceRight, c1Kicker, joist, c2Cleat]) {
    await projectCol('lumberRequirements').doc(r.id).set(r);
  }

  // pieces
  const piece = (overrides) => ({
    id: randomId(),
    projectId: DEMO_PROJECT_ID,
    materialType: 'phenolic',
    length: 0,
    width: 0,
    thickness: 0.018,
    condition: 'Good',
    usageCount: 0,
    storageLocation: '',
    dateAdded: new Date().toISOString(),
    retired: false,
    source: 'manual',
    ...overrides,
  });

  const p1 = piece({ materialType: 'phenolic', length: 2.44, width: 1.22, thickness: 0.018, storageLocation: 'Rack A', dateAdded: daysAgo(14), source: 'Supplier delivery' });
  const p2 = piece({ materialType: 'phenolic', length: 1.2, width: 0.6, thickness: 0.018, storageLocation: 'Rack B', dateAdded: daysAgo(9), source: 'Previous cut offcut' });
  const reusedPanel = piece({ materialType: 'phenolic', length: 0.3, width: 2.2, thickness: 0.018, storageLocation: 'Rack A', dateAdded: daysAgo(7), source: 'Previous cut offcut' });
  const inspectedPanel = piece({ materialType: 'phenolic', length: 0.6, width: 0.9, thickness: 0.018, condition: 'For Inspection', usageCount: 5, storageLocation: 'Rack C', dateAdded: daysAgo(20), source: 'Previous cut offcut' });
  const p5 = piece({ materialType: 'phenolic', length: 0.4, width: 0.5, thickness: 0.018, storageLocation: 'Rack C', dateAdded: daysAgo(3), source: 'Previous cut offcut' });
  const retiredPanel = piece({ materialType: 'phenolic', length: 1, width: 0.8, thickness: 0.018, condition: 'Retired', storageLocation: 'Rack D', dateAdded: daysAgo(30), source: 'Previous cut offcut', retired: true });
  const reusedLumber = piece({ materialType: 'lumber', length: 3, crossSection: '2x3', width: 0, thickness: 0, storageLocation: 'Lumber rack', dateAdded: daysAgo(8), source: 'Supplier delivery' });
  const wornLumber = piece({ materialType: 'lumber', length: 3, crossSection: '2x3', width: 0, thickness: 0, usageCount: 2, storageLocation: 'Lumber rack', dateAdded: daysAgo(12), source: 'Previous use' });
  const lumber48 = piece({ materialType: 'lumber', length: 4.8, crossSection: '2x4', width: 0, thickness: 0, storageLocation: 'Lumber rack', dateAdded: daysAgo(10), source: 'Supplier delivery' });
  const inspectedLumber = piece({ materialType: 'lumber', length: 1.2, crossSection: '2x2', width: 0, thickness: 0, condition: 'For Inspection', usageCount: 5, storageLocation: 'Lumber rack', dateAdded: daysAgo(18), source: 'Previous use' });
  const lumber1 = piece({ materialType: 'lumber', length: 1, crossSection: '2x3', width: 0, thickness: 0, storageLocation: 'Lumber rack', dateAdded: daysAgo(1), source: 'Previous use' });
  const checked = piece({ materialType: 'lumber', length: 1.5, crossSection: '2x4', width: 0, thickness: 0, usageCount: 1, storageLocation: 'Lumber rack', dateAdded: daysAgo(4), source: 'Previous use' });

  const pieces = [p1, p2, reusedPanel, inspectedPanel, p5, retiredPanel, reusedLumber, wornLumber, lumber48, inspectedLumber, lumber1, checked];
  for (const p of pieces) {
    // remove width/thickness for lumber? keep zeros; app sets width/thickness undefined? normalizePieceDimensions may set 0? Tests only count. Fine.
    await projectCol('pieces').doc(p.id).set(p);
  }

  // usage log entries
  const usage = (pieceId, label, date) => ({
    id: randomId(),
    pieceId,
    projectId: DEMO_PROJECT_ID,
    structuralMemberLabel: label,
    date,
    createdAt: new Date().toISOString(),
  });

  const usageEntries = [];
  for (let use = 5; use >= 1; use -= 1) usageEntries.push(usage(inspectedPanel.id, s1.label, daysAgo(use * 3)));
  usageEntries.push(usage(wornLumber.id, b1.label, daysAgo(6)));
  usageEntries.push(usage(wornLumber.id, c2.label, daysAgo(2)));
  for (let use = 5; use >= 1; use -= 1) usageEntries.push(usage(inspectedLumber.id, c2.label, daysAgo(use * 2)));
  usageEntries.push(usage(reusedPanel.id, c1.label, daysAgo(1)));
  usageEntries.push(usage(reusedLumber.id, braceA.label, daysAgo(1)));
  usageEntries.push(usage(checked.id, joist.label, daysAgo(1)));

  for (const u of usageEntries) {
    await projectCol('usageLog').doc(u.id).set(u);
  }

  // cutting plan
  const reusedPanelRequirementId = `${c1.id}-panel-1`;
  await projectCol('cuttingPlans').doc(randomId()).set({
    id: randomId(),
    projectId: DEMO_PROJECT_ID,
    createdAt: new Date().toISOString(),
    payload: {
      satisfiedRequirementIds: [reusedPanelRequirementId, braceA.id],
      acceptedByRequirement: {
        [reusedPanelRequirementId]: reusedPanel.id,
        [braceA.id]: reusedLumber.id,
      },
    },
  });

  console.log(`Seeded demo project ${DEMO_PROJECT_ID} for ${email}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
