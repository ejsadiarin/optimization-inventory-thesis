# Two-Scope Planner — Implementation Plan

## Overview

Replace the three overlapping project screens (Overview, Optimize, Member planner) with one Planner that switches between **Project scope** and **Member scope**. Project scope owns the project-wide allocation: every member's phenolic panels, all lumber including project-level lumber, new stock, offcuts, and exports. Member scope is a filtered projection of that same allocation, not a second packer. The plan has a persistent draft, a project-wide commit that records usage, locked committed allocations with explicit release, and visible invalidation when inputs change. Existing optimization decisions are discarded; there is no migration.

This implements [ADR-0008](../adr/0008-two-scope-planner.md). The engine and packer stay as they are for v1.

## Goals

- One Planner route with `scope=project|member`, defaulting to Project.
- One global phenolic allocation across all members; Member scope filters it and highlights the selected member.
- Project scope includes project-level lumber, all new-stock cutting plans, offcut return, and exports.
- Draft assignments persist; Commit records one usage event per newly committed piece; committed allocations are locked.
- Release frees a locked allocation without decrementing usage.
- Member edits and piece retirement/dimension changes release only affected allocations and surface a named warning.
- Member summary reports panel coverage and distinct boards serving the member; procurement totals stay in Project scope.
- Remove Overview and Optimize screens, checklist, next-action logic, and their tests.
- Keep largest-board-first shelf FFD and 90° rotation.

## Non-Goals / Out of Scope

- MAXRECTS, genetic algorithms, or a search over board/panel orderings. The ordering-search follow-up stays in `docs/FUTURE_NOTES.md`.
- Saw kerf, blade allowance, or non-guillotine cuts.
- Migrating old `workflow/optimization` documents or old cutting-plan snapshots.
- Piece reservation or per-piece locking beyond member-level exclusivity.
- Realtime `onSnapshot` collaboration; the existing refresh-on-focus/reconnect behavior remains.
- Redesigning Members, Inventory, Settings, authentication, or Firestore rules.
- Publishing GitHub issues from this plan.

## Background & Context

- ADR-0007 made `projects/{id}/workflow/optimization` the live optimization state. ADR-0008 replaces that workflow with a plan that has a draft, committed locks, and a project-wide scope. Old workflow documents are ignored, not read.
- `optimizeProject()` already matches all requirements and packs remaining panels/lumber globally. `allocatePanelsToPieces()` already packs panels from multiple members into one piece. The new work is mostly orchestration, persistence, projection, and UI consolidation.
- The current Member planner is a preview with local state. It must not become the source of truth: `allocationsForAssignments()` only sees the requirements passed to it, so a member-only packer would double-book pieces used by other members.
- UI vocabulary: **Cutting plan** for diagrams, **Board** for phenolic stock, **Piece** for lumber/offcuts/general. `GLOSSARY.md` keeps **Stock Sheet** as the technical term.
- The three real projects are the acceptance dataset; material utilization is the primary metric.

## Architecture / Design Summary

```
PlannerScreen (scope query param)
├── ProjectScope
│   ├── plan status + Commit / Release
│   ├── project summary (boards used, sheets saved, utilization, waste)
│   ├── reuse review for all requirements
│   └── cutting plans: Boards / Lumber / Offcuts + exports + offcut intake
└── MemberScope
    ├── member selector + member summary (coverage, distinct boards)
    ├── exclusive-member toggle
    ├── filtered reuse review (global candidate availability)
    └── boards serving the member, full board with member panels highlighted
```

Data flow:

```
members + lumber + pieces + plan
        │
        ├─ toMatchRequirements / matchInventory / reviewRequirements
        ├─ allocationsForAssignments (accepted requirements)
        ├─ optimizeProject (remaining requirements -> new stock)
        └─ buildPlannerState -> global boards + member projections + counts
```

Pure plan logic lives in `src/lib/planner.ts`; Firestore reads/writes live in `src/db/plan.ts`. Screens call the pure builder and the persistence functions; they do not re-implement packing.

## Data Models / Interfaces

### `src/db/types.ts`

Add the shared member list to usage entries:

```ts
export interface UsageLogEntry {
  // existing fields...
  structuralMemberLabel: string;
  structuralMemberLabels?: string[];
  requirementIds?: string[];
  requirementLabels?: string[];
}
```

### `src/db/plan.ts` (new)

```ts
export type PlanStatus = 'draft' | 'committed' | 'needs_review';

export interface PlanPlacement {
  pieceId: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export interface RequirementSnapshot {
  length: number;
  width?: number;
  crossSection?: CrossSection;
}

export interface PieceSnapshot {
  length: number;
  width: number;
  materialType: MaterialType;
  retired: boolean;
}

export interface PlanInvalidation {
  id: string;
  message: string;
  requirementIds: string[];
  pieceIds: string[];
  createdAt: string;
}

export interface ProjectPlan {
  schemaVersion: 1;
  status: PlanStatus;
  acceptedByRequirement: Record<string, string>;
  committedByRequirement: Record<string, string>;
  declinedCandidates: string[];
  exclusiveMemberIds: string[];
  placements: Record<string, PlanPlacement>;
  requirementSnapshots: Record<string, RequirementSnapshot>;
  pieceSnapshots: Record<string, PieceSnapshot>;
  usageRecordedPieceIds: string[];
  invalidations: PlanInvalidation[];
  committedAt: string | null;
  updatedAt: string;
}

export const PROJECT_PLAN_SCHEMA_VERSION = 1;
export const PROJECT_PLAN_ID = 'planner';

export function emptyProjectPlan(): ProjectPlan;
export function parseProjectPlan(data: unknown): ProjectPlan;
export async function getProjectPlan(projectId: string): Promise<ProjectPlan | null>;
export async function saveProjectPlan(projectId: string, plan: ProjectPlan): Promise<void>;
```

Firestore path: `projects/{projectId}/workflow/planner`. The old `workflow/optimization` document is never read.

### `src/lib/planner.ts` (new)

```ts
export interface PlannerPanel {
  panelId: string;
  requirementId: string;
  label: string;
  memberId?: string;
  memberLabel?: string;
  materialType: MaterialType;
}

export interface PlannerBoard {
  key: string;                       // `reuse:<pieceId>` | `stock:<sheetIndex>`
  source: 'reuse' | 'new_stock';
  pieceId?: string;
  materialType: MaterialType;
  stock: StockSize;
  panels: PlannerPanel[];
  plan: PlywoodSheetPlan | null;     // full nesting for phenolic boards
  offcuts: Offcut[];
}

export interface MemberProjection {
  memberId: string;
  memberLabel: string;
  panelIds: Set<string>;
  boards: PlannerBoard[];            // full boards, not cropped
  panelCoverage: { total: number; reused: number; newStock: number };
  distinctBoardCount: number;
  reuseAllocations: ReuseAllocation[];
}

export interface PlannerState {
  requirements: MatchRequirement[];
  groups: MatchGroup[];
  reviews: RequirementReview[];
  allocations: ReuseAllocation[];
  optimization: OptimizationResult;  // remaining requirements -> new stock
  boards: PlannerBoard[];
  memberProjections: Map<string, MemberProjection>;
  counts: {
    requirements: number;
    decided: number;
    needsDecision: number;
    reused: number;
    newStock: number;
    unplaced: number;
  };
}

export function buildPlannerState(input: {
  members: StructuralMember[];
  lumber: LumberRequirement[];
  pieces: MatchPiece[];
  stock: ProjectStock;
  plan: ProjectPlan;
}): PlannerState;

export function buildBoards(input: {
  acceptedByRequirement: ReadonlyMap<string, string>;
  requirements: readonly MatchRequirement[];
  pieces: readonly MatchPiece[];
  optimization: OptimizationResult;
  memberByRequirementId: ReadonlyMap<string, string>;
}): PlannerBoard[];

export function projectMemberBoards(
  boards: readonly PlannerBoard[],
  memberId: string,
): PlannerBoard[];

export function panelCoverage(
  boards: readonly PlannerBoard[],
  memberId: string,
): { total: number; reused: number; newStock: number };

export function distinctBoardCount(
  boards: readonly PlannerBoard[],
  memberId: string,
): number;

export function releaseAllocation(plan: ProjectPlan, requirementId: string): ProjectPlan;

export function reconcileProjectPlan(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): { plan: ProjectPlan; invalidations: PlanInvalidation[] };

export function committedPlacements(
  plan: ProjectPlan,
  requirements: readonly MatchRequirement[],
  pieces: readonly MatchPiece[],
): Record<string, PlanPlacement>;
```

### Engine type extensions

```ts
// src/engine/types.ts
export interface MatchPiece {
  // existing fields...
  thickness?: number;
  storageLocation?: string;
  dateAdded?: string;
  source?: string;
}

export interface LumberRequirementInput {
  id: string;
  label: string;
  length: number;
  crossSection: CrossSection;
  memberId?: string;
}
```

`toMatchPiece()` fills the new optional fields. `toMatchRequirements()` forwards `memberId` for lumber so member scope and usage labels can identify project-level versus member-linked lumber.

## Implementation Phases

### Phase 1 — Plan model and pure planner state

**Goal**: The global allocation and the member projection exist as pure, tested functions before any screen changes.

**Tasks**:

- [ ] Task 1.1 — Add `src/db/plan.ts` with the `ProjectPlan` types, `emptyProjectPlan()`, `parseProjectPlan()`, `getProjectPlan()`, and `saveProjectPlan()`.
  - Description: One project-scoped document at `workflow/planner`. `parseProjectPlan()` must defensively default missing arrays/records and force `schemaVersion: 1`.
  - Acceptance criteria: A unit test parses `{}` and returns an empty draft; a round-trip parse of a populated plan preserves records; no read of `workflow/optimization`.
  - Notes: Use `projectDoc(requireProjectId(projectId), 'workflow', PROJECT_PLAN_ID)` and `queueWrite` like other data modules.

- [ ] Task 1.2 — Add `src/lib/planner.ts` with `buildPlannerState()` and board/projection helpers.
  - Description: Build requirements with `toMatchRequirements()`, groups with `matchInventory()`, reviews with `reviewRequirements()`, reuse allocations with `allocationsForAssignments()`, and new stock with `optimizeProject()` over **all** requirements. Convert allocations and `optimization.plywood.sheets` into `PlannerBoard[]`. Map each panel ID to its member and label. Drop accepted assignments that cannot be placed (missing/retired piece, geometry no longer fits) from the effective map and report those requirements as Needs Decision. Honor `plan.exclusiveMemberIds`: an exclusive member's assignment is valid only when that piece is not used by another member.
  - Acceptance criteria: With two members and one piece that fits panels from both, `boards` contains one board with panels from both members; `memberProjections` for each member contains that same board; `panelCoverage` counts only that member's panels; `distinctBoardCount` counts the shared board once. An unplaceable accepted assignment does not appear as Satisfied.
  - Notes: `optimizeProject()` needs `satisfiedRequirementIds` = keys of the effective accepted map. Do not call it with a member subset. Project summary totals must include both reuse boards and new-stock sheets; do not use the remaining-only `optimization.stats` as the project total. Compute a naive baseline from all panels and compare it with the total boards used.

- [ ] Task 1.3 — Build the `PlannerBoard` list for both reuse and new stock.
  - Description: Reuse boards come from `ReuseAllocation` (`pieceId`, `plan`). New-stock boards come from `optimization.plywood.sheets`. For each board, attach `PlannerPanel[]` from the placed panel IDs. Lumber is not a board; expose the lumber plan separately through `optimization.lumber`.
  - Acceptance criteria: A reused board and a new-stock board both appear; a board with panels from two members is not split; offcuts are carried from `PlywoodSheetPlan.offcuts`.
  - Notes: Use stable keys. Piece IDs and sheet indices are stable enough for React keys.

- [ ] Task 1.4 — Extend `MatchPiece`, `LumberRequirementInput`, `toMatchPiece()`, and `toMatchRequirements()`.
  - Description: Add optional `thickness`, `storageLocation`, `dateAdded`, `source` to `MatchPiece`; add optional `memberId` to `LumberRequirementInput`; forward it in `toMatchRequirements()`.
  - Acceptance criteria: Existing engine tests still pass; a lumber requirement with `memberId` produces a `MatchRequirement` with the same `memberId`.
  - Notes: Optional fields keep existing fixtures compiling.

- [ ] Task 1.5 — Move `declinedKey()` into the new plan module.
  - Description: `reuseReview.ts` currently imports `declinedKey` from `db/workflow.ts`. Move it to `db/plan.ts` (or `lib/planner.ts`) and update imports. The key format stays `${requirementId}::${pieceId}`.
  - Acceptance criteria: `reuseReview` tests pass; no import from `db/workflow` remains outside the old screen/tests.

- [ ] Task 1.6 — Unit tests for the pure planner.
  - Description: Cover cross-member sharing, member projection, project-level lumber, member-linked lumber, panel coverage, distinct board count, and empty projects.
  - Acceptance criteria: `npm test -- src/lib/planner.test.ts` passes.

### Phase 2 — Commit, release, usage, and invalidation

**Goal**: The plan persists, commits once, locks allocations, and reports invalidation without losing usage history.

**Tasks**:

- [ ] Task 2.1 — Add `recordPlanUsage()` to `src/db/inventory.ts`.
  - Description: Record one usage event for a piece with `structuralMemberLabels: string[]`, `requirementIds`, and `requirementLabels`. Increment `usageCount` once, apply the existing `For Inspection` threshold, and write one usage-log entry. Keep `recordUsage()` for seed/manual single-member usage and implement it through the same internal helper.
  - Acceptance criteria: Committing a shared piece writes one usage-log entry whose `structuralMemberLabels` contains both members; `usageCount` increments by exactly one; existing inventory tests still pass.
  - Notes: `structuralMemberLabel` remains required for compatibility; set it to the first member label, or `'Project'` when no member is involved.

- [ ] Task 2.2 — Implement `reconcileProjectPlan()`.
  - Description: Walk `committedByRequirement`. Release an allocation when the requirement is missing, the piece is missing/retired/wrong material, the requirement's `length`/`width`/`crossSection` differs from `requirementSnapshots`, or the piece's `length`/`width`/`retired` differs from `pieceSnapshots`. Then repack the remaining committed requirements into their pieces; release any requirement that no longer fits. Append a `PlanInvalidation` naming the cause. Set `status: 'needs_review'` when anything was released. Never touch the usage log. For **draft** assignments, drop invalid assignments without creating a `Needs Review` warning; only committed allocations trigger invalidation.
  - Acceptance criteria: Editing one member's height releases only that member's allocations and produces a message like `C1 dimensions changed; 2 panels released.` Retiring one piece releases only its allocations. An unchanged plan returns the same plan object. A draft assignment on a retired piece simply disappears from the draft.
  - Notes: Do not compare labels or `For Inspection`; a condition change to `For Inspection` does not invalidate.

- [ ] Task 2.3 — Implement `releaseAllocation()`.
  - Description: Remove the requirement from `acceptedByRequirement` and `committedByRequirement`, remove its placements, and drop the piece from `usageRecordedPieceIds` when no other committed requirement uses it. Set `status: 'draft'` unless other invalidations remain, in which case keep `needs_review`. Do not add an invalidation.
  - Acceptance criteria: Releasing one of two requirements on a shared piece keeps the piece in `usageRecordedPieceIds`; releasing the last one removes it. Usage counts are unchanged.

- [ ] Task 2.4 — Implement `commitProjectPlan()` in `src/lib/planner.ts` or `src/db/plan.ts`.
  - Description: Signature: `commitProjectPlan(projectId, plan, state: PlannerState): Promise<ProjectPlan>`. Reconcile first; refuse to commit when any review is `needsDecision` or when there are no requirements. Build `committedByRequirement` from the effective `acceptedByRequirement`, compute and store placements, snapshot each committed requirement and piece, and record usage for every piece not already in `usageRecordedPieceIds`. Set `status: 'committed'`, clear invalidations, set `committedAt`/`updatedAt`, persist.
  - Acceptance criteria: First commit records one event per piece; a second commit with no changes records none; a new piece committed later records one; a released-and-re-added piece records a new event.
  - Notes: Call `recordPlanUsage()` before `saveProjectPlan()` so a failed usage write does not mark the plan committed. If a write fails, surface the error and leave the saved plan unchanged. `state` supplies the reviews, requirements, and pieces used to build placements and usage labels.

- [ ] Task 2.5 — Add a `useProjectPlan(projectId)` hook or screen-level load/save.
  - Description: Load the plan, reconcile it against current requirements/pieces, save the reconciled plan when it changed, and expose `updatePlan()` with the same dirty-ref pattern as the old workflow. `updatePlan()` sets `status: 'draft'` unless the plan is already `needs_review`; a background refresh must not discard an unsaved local edit.
  - Acceptance criteria: A draft survives reload; a stale committed allocation is reconciled on load and the warning is visible; editing a committed plan makes the status Draft while keeping committed allocations locked.

- [ ] Task 2.6 — Unit and emulator tests.
  - Description: `src/db/plan.test.ts` for parse/empty/reconcile/release; `src/db/plan.emulator.test.ts` for load/save; extend `inventory.emulator.test.ts` for `recordPlanUsage`. Add a test that an old `workflow/optimization` document is ignored.
  - Acceptance criteria: `npm test` and `npm run test:emulator` pass for the new modules.

### Phase 3 — Project scope UI

**Goal**: Project scope replaces Optimize and exposes the whole allocation, the plan lifecycle, and the cutting plans.

**Tasks**:

- [ ] Task 3.1 — Add `src/screens/PlannerScreen.tsx`.
  - Description: Read `scope` from `useSearchParams`; accept `project` and `member`, default to `project`. Render a two-item scope switch (Project / Member). Keep the scope in the URL so links and the notification bell can target it. Member selection is local state defaulting to the first member; an optional `member` query parameter may be added for deep links.
  - Acceptance criteria: `/projects/:id/planner` opens Project; `?scope=member` opens Member; switching scope does not lose the selected member.

- [ ] Task 3.2 — Add `src/components/planner/ProjectScope.tsx`.
  - Description: Render the plan status, the project summary (boards used, sheets saved, utilization, waste), the reuse review, and the cutting plans. Project scope is the only place with Commit, Release, offcut intake, and exports.
  - Acceptance criteria: Project scope shows all members' requirements; the Commit button is disabled while any review is `needsDecision`; a committed plan shows locked allocations and a Release action.

- [ ] Task 3.3 — Reuse `MatchGroups` for project-wide review.
  - Description: Pass all reviews, all accepted assignments, and the shared-piece hint. The existing `reviewRequirements()` already computes candidate availability globally when given all groups. Keep the status filter and counts.
  - Acceptance criteria: A candidate that fits alongside another member's panel still shows `shares piece · remaining space fits`; accepting it updates the draft and does not record usage before commit.

- [ ] Task 3.4 — Build the board/cutting-plan section.
  - Description: Reuse `CuttingPlans`/`SheetDiagram` for reuse boards and new-stock sheets. Rename the phenolic tab from `Sheets` to `Boards`; keep `Lumber` and `Offcuts`. Show the full board, not a per-member crop.
  - Acceptance criteria: A board with panels from several members renders once with all panels; exports work; offcut intake is available only here.

- [ ] Task 3.5 — Add the plan lifecycle panel.
  - Description: Show `Draft`, `Committed`, or `Needs Review`; a `Commit plan` button with a confirmation that explains usage recording; a `Release` action on each committed allocation with a confirmation. Show invalidations as an amber warning with a `Review` link that filters the review to the affected requirements.
  - Acceptance criteria: Commit records usage and changes the status; Release frees the requirement without changing usage; Needs Review names the cause.

- [ ] Task 3.6 — Add compact piece details.
  - Description: On candidate and assigned rows show piece ID, optional label, dimensions, condition badge, usage count, storage location, requires cutting, inspection-after-this-use, and `also serves C1`. Add a detail affordance that opens the existing piece detail dialog or a planner-specific summary showing `Used for C1, C2`.
  - Acceptance criteria: The shared-piece row names the other member; the detail view lists every member and requirement in the usage entry.

- [ ] Task 3.7 — Screen tests.
  - Description: `PlannerScreen.test.tsx` covers default scope, project summary, commit, release, invalidation warning, shared-piece hint, and board rendering. Mock the data modules and the plan hook.
  - Acceptance criteria: `npm test -- src/screens/PlannerScreen.test.tsx` passes.

### Phase 4 — Member scope UI

**Goal**: Member scope becomes a projection with highlighting and an explicit exclusivity opt-out.

**Tasks**:

- [ ] Task 4.1 — Add `src/components/planner/MemberScope.tsx`.
  - Description: Member selector, member header (dimensions and type), member summary (panel coverage and distinct board count), and the member's panels. Use the global `PlannerState`; never call `optimizeProject()` with `selected.panels`.
  - Acceptance criteria: Selecting a member changes only the projection; the same board can appear under two members with different highlighting.

- [ ] Task 4.2 — Render the member's boards with highlighting.
  - Description: Add `highlightPanelIds?: ReadonlySet<string>` to `SheetDiagram`. In Member scope, render every board that contains a panel from the selected member, in full, with the member's panels at full opacity and other members' panels muted. Reuse the existing member colors.
  - Acceptance criteria: A shared board shows all panels; the selected member's panels are visually dominant; labels remain readable.

- [ ] Task 4.3 — Filter the reuse review without changing candidate availability.
  - Description: Show only reviews whose `memberId` matches the selected member (plus the member's lumber). Candidate availability, `assignedElsewhereCount`, and `shares piece · remaining space fits` must still be computed against **all** requirements and assignments. If Member scope keeps a `Use best matches` action, run it against the global piece set; for an exclusive member, exclude pieces already used by another member.
  - Acceptance criteria: A piece already used by another member is not offered as free space unless the new panel still fits; accepting from Member scope updates the same draft as Project scope; `Use best matches` never creates a cross-member allocation for an exclusive member.

- [ ] Task 4.4 — Add the Exclusive Member Plan toggle.
  - Description: A per-member toggle backed by `exclusiveMemberIds`. Toggling it on requires confirmation if the member has draft assignments on shared pieces; release those assignments and disable shared-piece candidates. If the plan is committed, require releasing the member's locked allocations first. Show a short note that exclusivity may reduce utilization. Exclusivity constrains **reuse** candidates; new-stock sheets may still contain panels from multiple members.
  - Acceptance criteria: An exclusive member's panels never share an inventory piece with another member; the member falls back to new stock when no unshared piece fits; turning exclusivity off allows sharing again.

- [ ] Task 4.5 — Show member-linked lumber and full lumber stock plans.
  - Description: Member scope shows only member-linked lumber requirements, but renders the full new-stock lumber stock lengths with the member's cuts highlighted. Project scope shows all lumber, including project-level. Offcut return and exports stay out of Member scope.
  - Acceptance criteria: A project-level lumber requirement is absent from Member scope and present in Project scope; a shared stock length shows other members' cuts muted.

- [ ] Task 4.6 — Member scope tests.
  - Description: Cover projection, highlighting, global candidate availability, exclusivity, and the absence of export/offcut actions.
  - Acceptance criteria: `npm test -- src/components/planner/MemberScope.test.tsx` passes.

### Phase 5 — Navigation, progress, notifications, and cleanup

**Goal**: Planner is the landing route and the only project optimization surface.

**Tasks**:

- [ ] Task 5.1 — Update `src/screens/projectNav.ts`.
  - Description: Items become `members`, `inventory`, `planner`, `settings`. Remove `Overview`, `Optimize`, `focus`, and `separatorBefore`. Keep `projectNavHref()`.
  - Acceptance criteria: Project nav tests assert four items and no `optimize`/`focus`.

- [ ] Task 5.2 — Update `src/App.tsx`.
  - Description: Index route navigates to `planner`. Add `planner` route. Redirect `optimize` to `planner?scope=project`, `focus` to `planner?scope=member`, and `summary` to `planner`. Remove `ProjectOverviewScreen`, `OptimizationScreen`, and `MemberFocusScreen` imports.
  - Acceptance criteria: Old URLs land on the correct scope; the catch-all still works.

- [ ] Task 5.3 — Update `src/components/ProjectLayout.tsx`.
  - Description: Replace nav icons with `Boxes`, `Package`, `Crosshair`, `Settings`. Remove the `Alternative flow` separator. Change the active-item fallback from `Overview` to `Planner`. Change the mobile bottom nav from `grid-cols-6` to `grid-cols-4`.
  - Acceptance criteria: Desktop and mobile nav render four items; Planner is active on the landing route.

- [ ] Task 5.4 — Simplify `src/lib/projectProgress.ts` and its context.
  - Description: Remove `ProjectChecklistItem`, `ProjectChecklistId`, `buildProjectChecklist()`, and `getNextProjectAction()`. Keep `ProjectProgressCounts`, `ProjectNavAnnotation`, and `buildNavAnnotations()`. Counts become `structuralMembers`, `lumberRequirements`, `pieces`, `requirements`, `decidedRequirements`, `planStatus`, `hasPlan`. The Planner annotation counts `requirements - decidedRequirements`; it is complete when the plan is committed and nothing is outstanding.
  - Acceptance criteria: No runtime reference to checklist or next action; nav counts reflect the draft plan.

- [ ] Task 5.5 — Rewrite `ProjectProgressProvider`.
  - Description: Load members, lumber, pieces, and the project plan; build `PlannerState`; reconcile the plan; compute counts and notifications. Remove the cutting-plan snapshot fallback and the old workflow load. Keep the refresh signal and `reload()`.
  - Acceptance criteria: The bell and nav counts update after a draft change; a committed plan with no outstanding decisions shows complete; no read of `workflow/optimization` or `cuttingPlans`.

- [ ] Task 5.6 — Update `src/lib/projectNotifications.ts`.
  - Description: Oversized panels/lumber point to `planner?scope=project` (or the cutting-plan section). Add a notification for plan invalidations with the named cause; point it to the affected scope/member when possible.
  - Acceptance criteria: Every notification link lands on Planner and not on `/optimize`; tests assert the hrefs.

- [ ] Task 5.7 — Delete obsolete screens and modules.
  - Description: Delete `ProjectOverviewScreen.tsx`, `OptimizationScreen.tsx`, `MemberFocusScreen.tsx`, their tests, `ProjectOverviewScreen.test.tsx`, `OptimizationScreen.test.tsx`, `MemberFocusScreen.test.tsx`, `db/workflow.ts` and its tests, `test/workflowMock.ts`, and any now-unused imports of `addUsageRequirements`/`saveOptimizationWorkflow`. Keep `db/plans.ts` only if seed/tests still need it; no runtime read.
  - Acceptance criteria: `rg "OptimizationScreen|MemberFocusScreen|ProjectOverviewScreen|saveOptimizationWorkflow|getOptimizationWorkflow|workflowFromSnapshot" src` returns nothing outside comments or deleted files. `npm run build` passes.

- [ ] Task 5.8 — Update tests for navigation and progress.
  - Description: Update `projectNav.test.ts`, `ProjectProgressProvider.test.tsx`, `projectProgress.test.ts`, `projectNotifications.test.ts`, and `ProjectLayout.test.tsx` for the four-item nav, Planner route, draft counts, and invalidation notifications.
  - Acceptance criteria: `npm test` passes.

### Phase 6 — Documentation and verification

**Goal**: The repo describes the new planner and the build is green.

**Tasks**:

- [ ] Task 6.1 — Update `docs/user-flow.md`.
  - Description: Replace the Overview → Optimize → Member planner flow with the Planner Project/Member scope flow, draft/commit/release, and invalidation behavior.
  - Acceptance criteria: No instructions point at `/optimize` or `/focus` except as legacy redirects.

- [ ] Task 6.2 — Update `docs/spec.md`.
  - Description: Replace the optimization-session language with plan draft/commit/locked allocations; describe cross-member sharing, exclusive member plans, member projections, usage recording, and the removed Overview. Remove stale "local-only/no backend" statements only where they are already contradicted by ADR-0006; do not rewrite unrelated sections.
  - Acceptance criteria: Spec matches ADR-0008 and the glossary.

- [ ] Task 6.3 — Mark ADR-0007 as superseded.
  - Description: Add a short status line to `docs/adr/0007-persist-optimization-workflow.md` pointing to ADR-0008. Keep the historical record.
  - Acceptance criteria: A reader of ADR-0007 sees that the live-state decision was replaced.

- [ ] Task 6.4 — Update `README.md` if it names Optimize or Member planner as separate screens.
  - Description: Keep the change surgical; only update route/screen names and the material-efficiency message.
  - Acceptance criteria: No stale screen names in the quick start.

- [ ] Task 6.5 — Run the full verification.
  - Description: `npm run lint`, `npm test`, `npm run build`, and `npm run test:emulator` (if the emulator is configured). Manually check Project scope, Member scope, commit, release, invalidation, shared-board highlighting, and legacy redirects on a desktop and a narrow viewport.
  - Acceptance criteria: All commands pass; the manual checklist is complete.

## Edge Cases & Error Handling

- **No members**: Project scope shows an empty state with a link to Members. Commit is disabled.
- **No inventory**: Every requirement is new stock; the plan can still be committed, and no usage is recorded.
- **No candidates but not declined**: Status is `new stock`; no decision is required. Commit is allowed.
- **All candidates declined**: Status is `no match`; commit is allowed. Restoring a candidate returns it to `needs decision`.
- **Oversized panel or lumber**: It appears as unplaced and in the notification bell. Commit may still proceed for the reuse allocations; the warning remains.
- **Shared piece with multiple members**: One usage event, `structuralMemberLabels` contains every member, and the detail shows `Used for C1, C2`.
- **Re-commit with no changes**: No new usage events.
- **Release then re-add**: The piece leaves `usageRecordedPieceIds` when no other committed requirement uses it; a later commit records a new event and increments usage again. Usage history is append-only.
- **Member edit**: Only that member's committed requirements are released if their geometry changed. Panel IDs stay stable (`memberId-panel-N`).
- **Piece retirement/dimension change**: Every committed requirement on that piece is released. A change to `For Inspection` does not invalidate.
- **Exclusive member with no unshared piece**: Falls back to new stock and shows why.
- **Project-level lumber**: No member label; use `'Project'` for `structuralMemberLabel` and the requirement label in `requirementLabels`.
- **Offline commit**: Reads may come from cache; usage and plan writes queue through the existing `queueWrite`/sync-status path. If a usage write throws, do not mark the plan committed.
- **Concurrent devices**: Last-write-wins remains. A stale plan is reconciled on load; the warning names the released allocations.
- **Plan document size**: Placements and snapshots are compact objects keyed by requirement/panel ID. If a project grows beyond Firestore's document limit, split placements into a subcollection; do not do this preemptively.

## Testing Strategy

**Unit tests**

- `src/lib/planner.test.ts`: global allocation, cross-member board, member projection, coverage, distinct boards, project-level lumber, empty input.
- `src/db/plan.test.ts`: parse defaults, empty plan, release, reconcile (missing requirement, retired piece, dimension change, unchanged plan).
- Extend `src/components/optimize/reuseReview.test.ts`: global candidate availability and shared-piece hints when given all requirements.
- `src/lib/projectProgress.test.ts`: draft counts, complete only when committed, no checklist/next action.
- `src/lib/projectNotifications.test.ts`: Planner hrefs and invalidation notification.

**Emulator tests**

- `src/db/plan.emulator.test.ts`: load/save `workflow/planner`; old `workflow/optimization` is ignored.
- Extend `src/db/inventory.emulator.test.ts`: `recordPlanUsage` writes one event, increments once, records multiple member labels, applies the inspection threshold.
- Optional: a commit flow test that seeds members/pieces/plan, calls `commitProjectPlan`, and asserts plan status plus usage log.

**Screen tests**

- `PlannerScreen.test.tsx`: default scope, scope switch, project summary, commit/release, invalidation warning, legacy redirect.
- `ProjectScope.test.tsx`: all requirements, shared-piece hint, board rendering, offcut/export only here.
- `MemberScope.test.tsx`: member summary, full board with highlighting, global candidate availability, exclusivity, no exports/offcut intake.
- Update `ProjectLayout.test.tsx`, `projectNav.test.ts`, `ProjectProgressProvider.test.tsx`.

**Manual checks**

- Create a project with two members whose panels fit on one inventory board. Project scope shows one shared board; each Member scope shows the same board with that member highlighted.
- Accept a shared candidate in Member scope; switch to Project scope and confirm the same draft assignment.
- Commit; verify one usage event on the shared board naming both members.
- Re-commit and verify no second event.
- Edit a member height; verify only its allocations release and the warning names it.
- Retire a board; verify its allocations release and the usage log is unchanged.
- Release a committed allocation, reassign, and re-commit; verify a new usage event.
- Toggle Exclusive Member Plan; verify the member cannot use a board shared with another member.
- Open old `/optimize` and `/focus` URLs; verify the correct scope.
- Check the mobile bottom nav has four items and the Planner is active.

## Open Questions

- [ ] **Needs Review clearing**: Should status return to `committed` only after the affected requirements are re-decided and the plan is re-committed? Recommended: yes; a successful commit clears invalidations. If the engineer wants to dismiss without recommitting, add an explicit `Acknowledge` action later.
- [ ] **Project-level lumber usage label**: Recommended: `structuralMemberLabels: ['Project']` and `structuralMemberLabel: 'Project'`; the requirement label still appears in `requirementLabels`. Confirm during implementation if the thesis needs a different display.
- [ ] **Exclusive toggle on a committed member**: Recommended: require releasing that member's locked allocations first, rather than silently releasing them. This preserves the "locked means locked" rule.

## Dependencies

- Existing React, React Router, Firestore, Vitest, and the current engine. No new runtime dependency.
- Existing Firestore rules already permit project subcollection access; no rules change is expected.
- The Firebase emulator is needed for the emulator suite.

## Acceptance Criteria

- Planner is the project landing route with Project and Member scopes; Overview and Optimize are gone.
- Project scope computes one global allocation; Member scope is a filtered projection, not a second packer.
- A board can serve panels from multiple members; each member's view shows the full board with its panels highlighted.
- The plan has a persistent draft, a project-wide Commit, locked committed allocations, and explicit Release.
- Commit records exactly one usage event per piece, with every member and requirement it serves; re-commit does not double-count.
- Member edits and piece retirement/dimension changes release only affected allocations and show a named warning.
- Member summary shows panel coverage and distinct boards; Project summary shows procurement totals.
- Offcut return and exports exist only in Project scope.
- Project-level lumber appears only in Project scope; member-linked lumber appears in Member scope.
- Old `/optimize` and `/focus` links redirect to the correct Planner scope.
- `npm run lint`, `npm test`, `npm run build`, and the emulator suite pass.
