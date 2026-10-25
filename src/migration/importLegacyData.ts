import { writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateAccessCode } from '@/lib/ids';
import {
  generateAccessCodeSalt,
  hashAccessCode,
} from '@/lib/access-code';
import { projectDoc } from '@/lib/firestore-helpers';
import { db as legacyDb } from '@/migration/legacyDb';
import type { ProjectOwner } from '@/db/types';

const FLAG = 'formwork.firestore-migration.v1';
const BATCH_SIZE = 400;

type MigrationUser = ProjectOwner;

function requireDb() {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  return db;
}

async function runImport(user: MigrationUser): Promise<number> {
  const firestore = requireDb();

  const legacyProjects = await legacyDb.projects.toArray();
  if (legacyProjects.length === 0) {
    globalThis.localStorage.setItem(FLAG, 'done');
    return 0;
  }

  const members = await legacyDb.structuralMembers.toArray();
  const requirements = await legacyDb.lumberRequirements.toArray();
  const pieces = await legacyDb.pieces.toArray();
  const usage = await legacyDb.usageLog.toArray();
  const plans = await legacyDb.cuttingPlans.toArray();

  const writes: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = [];

  for (const legacy of legacyProjects) {
    const legacyAccessCode = legacy.accessCode;
    let code = legacyAccessCode;
    if (!code) {
      code = generateAccessCode();
      console.warn(
        `Legacy project ${legacy.id} had no access code; generated a new one.`,
      );
    }
    const salt = generateAccessCodeSalt();
    const hash = await hashAccessCode(code, salt);

    const projectData: Record<string, unknown> = {
      id: legacy.id,
      name: legacy.name,
      ownerId: user.uid,
      ownerName: user.name,
      schemaVersion: 1,
      createdAt: legacy.createdAt,
      costs: legacy.costs,
      stock: legacy.stock,
      accessCodeHash: hash,
      accessCodeSalt: salt,
    };
    writes.push({
      ref: doc(firestore, 'projects', legacy.id),
      data: projectData,
    });

    for (const member of members.filter((item) => item.projectId === legacy.id)) {
      writes.push({
        ref: projectDoc(legacy.id, 'structuralMembers', member.id),
        data: { ...member },
      });
    }
    for (const requirement of requirements.filter(
      (item) => item.projectId === legacy.id,
    )) {
      writes.push({
        ref: projectDoc(legacy.id, 'lumberRequirements', requirement.id),
        data: { ...requirement },
      });
    }
    for (const piece of pieces.filter((item) => item.projectId === legacy.id)) {
      writes.push({
        ref: projectDoc(legacy.id, 'pieces', piece.id),
        data: { ...piece },
      });
    }
    for (const entry of usage.filter((item) => item.projectId === legacy.id)) {
      writes.push({
        ref: projectDoc(legacy.id, 'usageLog', entry.id),
        data: { ...entry },
      });
    }
    for (const plan of plans.filter((item) => item.projectId === legacy.id)) {
      writes.push({
        ref: projectDoc(legacy.id, 'cuttingPlans', plan.id),
        data: {
          id: plan.id,
          projectId: plan.projectId,
          createdAt: plan.createdAt,
          payload: plan.payload,
        },
      });
    }
  }

  // idempotent headroom: chunk
  for (let index = 0; index < writes.length; index += BATCH_SIZE) {
    const chunk = writes.slice(index, index + BATCH_SIZE);
    const batch = writeBatch(firestore);
    for (const write of chunk) {
      batch.set(write.ref, write.data);
    }
    await batch.commit();
  }

  globalThis.localStorage.setItem(FLAG, 'done');
  return legacyProjects.length;
}

let inFlight: Promise<number> | null = null;

export function importLegacyData(user: MigrationUser): Promise<number> {
  if (globalThis.localStorage.getItem(FLAG) === 'done') {
    return Promise.resolve(0);
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = runImport(user)
    .catch((error) => {
      inFlight = null;
      throw error;
    })
    .then((result) => {
      inFlight = null;
      return result;
    });
  return inFlight;
}
