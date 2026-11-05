import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { projectRef } from '@/lib/firestore-helpers';
import { seedDemoProject, DEMO_PROJECT_NAME, DEMO_ACCESS_CODE, DEMO_PROJECT_ID } from './seed';
import { listStructuralMembers } from './members';
import { listLumberRequirements } from './members';
import { listPieces, getActivePieces } from './inventory';
import { getProjectPlan } from './plan';
import { verifyProjectAccess } from './projects';
import { decomposeMember } from '@/engine/decompose';
import { optimizeProject, toMatchRequirements } from '@/engine';
import { matchInventory } from '@/engine/match';
import { reviewRequirements } from '@/components/optimize/reuseReview';
import { toMatchPiece } from '@/lib/pieces';
import type { ProjectOwner } from './types';
import {
  clearAuth,
  clearFirestore,
  flushPendingWrites,
  signInDemoUser,
  signOutDemoUser,
} from '@/test/emulator';

let owner: ProjectOwner = { uid: 'demo-user', name: 'Demo Engineer' };

beforeAll(async () => {
  await flushPendingWrites();
  await clearAuth();
  await clearFirestore();
  const uid = await signInDemoUser();
  owner = { uid, name: 'Demo Engineer' };
});

beforeEach(async () => {
  await flushPendingWrites();
  await clearFirestore();
});

afterAll(async () => {
  await flushPendingWrites();
  await signOutDemoUser();
});

describe('seedDemoProject on Firestore', () => {
  it('creates the full demo project on first seed', async () => {
    const result = await seedDemoProject(owner);

    expect(result.accessCode).toBe(DEMO_ACCESS_CODE);
    expect(result.project.id).toBe(DEMO_PROJECT_ID);
    expect(result.project.name).toBe(DEMO_PROJECT_NAME);
    expect(result.project.ownerId).toBe(owner.uid);
    expect(result.project.ownerName).toBe(owner.name);

    const members = await listStructuralMembers(result.project.id);
    const requirements = await listLumberRequirements(result.project.id);
    const pieces = await listPieces(result.project.id);

    expect(members).toHaveLength(6);
    expect(requirements).toHaveLength(5);
    expect(pieces).toHaveLength(12);
    expect(pieces.filter((piece) => piece.retired)).toHaveLength(1);
    expect(pieces.filter((piece) => piece.condition === 'For Inspection')).toHaveLength(2);
    expect(pieces.some((piece) => piece.usageCount >= 5)).toBe(true);

    const plan = await getProjectPlan(result.project.id);
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!.acceptedByRequirement)).toHaveLength(2);

    expect(await verifyProjectAccess(result.project.id, DEMO_ACCESS_CODE)).toBe(true);

    const raw = await getDoc(projectRef(result.project.id));
    const data = raw.data() as Record<string, unknown>;
    expect(data.accessCodeHash).toBeTruthy();
    expect(data.accessCodeSalt).toBeTruthy();
    expect(data.accessCode).toBeUndefined();

  });

  it('seeds reuse candidates and reusable offcuts', async () => {
    const result = await seedDemoProject(owner);
    const [members, lumber, pieces, plan] = await Promise.all([
      listStructuralMembers(result.project.id),
      listLumberRequirements(result.project.id),
      getActivePieces(result.project.id),
      getProjectPlan(result.project.id),
    ]);
    expect(plan).not.toBeNull();
    const satisfiedRequirementIds = new Set(Object.keys(plan!.acceptedByRequirement));

    const panels = members.flatMap(decomposeMember);
    const requirements = toMatchRequirements(panels, lumber);
    const matchPieces = pieces.map(toMatchPiece);
    const reviews = reviewRequirements(
      matchInventory(requirements, matchPieces),
      satisfiedRequirementIds,
      new Map(Object.entries(plan!.acceptedByRequirement)),
      new Set(plan!.declinedCandidates),
    );

    expect(reviews.filter((review) => review.status === 'needsDecision').length).toBeGreaterThan(
      0,
    );

    const optimization = optimizeProject({
      panels,
      lumberRequirements: lumber,
      stock: result.project.stock,
      costs: result.project.costs,
      pieces: matchPieces,
      satisfiedRequirementIds,
    });
    const reusableOffcuts = optimization.plywood.sheets
      .flatMap((sheet) => sheet.offcuts)
      .filter((offcut) => offcut.reusable);

    expect(reusableOffcuts.length).toBeGreaterThan(0);
  });

  it('is idempotent on re-seed', async () => {
    const first = await seedDemoProject(owner);
    const membersBefore = await listStructuralMembers(first.project.id);
    const requirementsBefore = await listLumberRequirements(first.project.id);
    const piecesBefore = await listPieces(first.project.id);

    const second = await seedDemoProject(owner);
    expect(second.project.id).toBe(first.project.id);
    expect(second.accessCode).toBe(DEMO_ACCESS_CODE);

    const membersAfter = await listStructuralMembers(second.project.id);
    const requirementsAfter = await listLumberRequirements(second.project.id);
    const piecesAfter = await listPieces(second.project.id);

    expect(membersAfter).toHaveLength(membersBefore.length);
    expect(requirementsAfter).toHaveLength(requirementsBefore.length);
    expect(piecesAfter).toHaveLength(piecesBefore.length);
  });
});
