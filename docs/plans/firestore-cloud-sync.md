# Firestore Cloud Sync — Implementation Plan

## Goal

Turn the local-only formwork-cutting-optimizer PWA into an offline-first app with an online
database. An engineer signs in once, sees a shared project marketplace, opens a project with its
access code, and keeps working offline. Changes sync when the device reconnects.

This plan implements the decisions in
[ADR-0006](../adr/0006-firestore-cloud-sync.md). It replaces the Dexie data layer with Cloud
Firestore, adds Firebase Authentication, and deploys the existing React + Vite build to Vercel.

## Published Tickets

Published as GitHub Issues in dependency order:

- #9 Sign in to the shared workspace
- #10 Publish and browse Projects in the Project Marketplace
- #11 Manage Structural Members and Lumber Requirements online
- #12 Track inventory Pieces and Usage Log online
- #13 Persist and share Cutting Plans
- #14 Show offline Sync status and refresh on focus/reconnect
- #15 Import legacy local Projects
- #16 Restore the idempotent demo Project seed
- #17 Ship the synced prototype (human-gated)

## Scope

In scope:

- Firebase project, web app config, Firestore, Auth, emulator config.
- Firestore data modules behind the existing `src/db/*` API shape (with project-scoped signatures).
- Email/password sign-in, one pre-created demo account, sign-out.
- Global project marketplace with an owner badge.
- Access Code generated once, stored as a salted SHA-256 hash, required by everyone each session.
- Offline reads and queued writes via Firestore's persistent local cache.
- One-time import of existing Dexie data.
- Sync-status chip and refresh-on-focus/reconnect.
- Emulator-backed tests for data, rules, and migration; mocked data modules for screen tests.
- Update ADR-0002 status, glossary, spec, README, and Firebase setup guide.

Out of scope:

- Open registration, password reset, email verification, OAuth.
- Server-side Access Code enforcement or per-project authorization.
- Realtime `onSnapshot` collaboration, conflict UI, soft-delete/restore.
- Client-side encryption, project deletion UI, multi-environment Firebase projects.
- Next.js migration.

## Target Firestore Shape

```
projects/{projectId}
  id, name, ownerId, ownerName,
  accessCodeHash, accessCodeSalt,
  schemaVersion: 1, createdAt, costs, stock

  structuralMembers/{memberId}
  lumberRequirements/{requirementId}
  pieces/{pieceId}
  usageLog/{entryId}
  cuttingPlans/{planId}
```

Subcollection documents keep their `projectId` field so the existing TypeScript types do not
change shape. The document path is authoritative. Timestamps remain ISO strings.

## Phase 0 — Firebase project setup (manual, once)

1. Create one Firebase project, e.g. `formwork-optimizer`. Do not create separate dev/prod
   projects.
2. Add a Web app. Copy the config values into `.env.local`.
3. Authentication → Sign-in method → enable Email/Password.
4. Authentication → Users → add `demo@example.com` with password `demo1234` and display name
   `Demo Engineer`. This is the only account for v1. Leave public sign-up disabled to match the
   login-only UI.
5. Firestore Database → create in production mode (rules are deployed from the repo).
6. Add the deployed Vercel domain under Authentication → Settings → Authorized domains.
7. Install the Firebase CLI (`npm i -D firebase-tools`) and run `firebase login`.

Verification: the Firebase console shows one Auth user and an empty Firestore database.

## Phase 1 — Dependencies, environment, Firebase config files

Files:

- `package.json`
- `.env.example` (new)
- `.gitignore`
- `src/vite-env.d.ts`
- `firebase.json` (new)
- `.firebaserc` (new)
- `firestore.rules` (new)
- `firestore.indexes.json` (new)
- `vercel.json` (new)

Tasks:

1. Add runtime dependency `firebase`.
2. Add dev dependencies `firebase-tools`, `firebase-admin`, `@firebase/rules-unit-testing`.
3. Add `.env.example` with:

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   VITE_USE_FIREBASE_EMULATOR=false
   ```

4. Ensure `.gitignore` excludes `.env.local`, `.env.*.local`, and service-account JSON files.
   Commit only `.env.example`.
5. Add the `ImportMetaEnv` keys to `src/vite-env.d.ts`.
6. Add `firebase.json` with Firestore rules/indexes and emulators:
   - Auth: `9099`
   - Firestore: `8080`
   - Emulator UI: `4000`
7. Add `.firebaserc` with the real project id as the default alias.
8. Add `firestore.indexes.json` with empty `indexes` and `fieldOverrides`. Single-field indexes
   are automatic; no composite indexes are required by this plan.
9. Add `vercel.json` SPA rewrite from `/(.*)` to `/index.html`.
10. Add scripts:

    ```json
    "test:emulator": "firebase emulators:exec --only auth,firestore --project demo-test \"vitest run --config vitest.emulator.config.ts\"",
    "test:all": "npm test && npm run test:emulator",
    "seed:emulator": "node scripts/seed-emulator.mjs"
    ```

Verification: `npm run build` still passes; no secret values are committed.

## Phase 2 — Firebase client, types, access codes

### `src/lib/firebase.ts` (new)

- Initialize the app with `VITE_FIREBASE_*` values.
- Export `auth` from `getAuth(app)`.
- Export `db` from:

  ```ts
  initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  ```

- When `VITE_USE_FIREBASE_EMULATOR === 'true'`, call `connectAuthEmulator` and
  `connectFirestoreEmulator` once, using `127.0.0.1` and ports 9099/8080. Guard against double
  connection during HMR with a module-level flag.
- Export a `firebaseConfigured` boolean (all required env values present) so the app can render a
  clear "Firebase is not configured" message instead of crashing.

Verification: a unit test can import the module with fake env values; no network calls happen at
import time.

### `src/db/types.ts`

- Remove `accessCode` from `Project`.
- Add `ownerId: string`, `ownerName: string`, and `schemaVersion: number` to `Project`.
- Keep every entity type and `JsonValue` unchanged otherwise.
- Add a `ProjectOwner` type:

  ```ts
  export interface ProjectOwner {
    uid: string;
    name: string;
  }
  ```

- Add a `CreatedProject` type:

  ```ts
  export interface CreatedProject {
    project: Project;
    accessCode: string;
  }
  ```

### `src/lib/access-code.ts` (new)

- `hashAccessCode(code: string, salt: string): Promise<string>` — normalize with
  `normalizeAccessCode`, encode with `TextEncoder`, salt as hex bytes, `crypto.subtle.digest`
  SHA-256, return lowercase hex.
- `generateAccessCodeSalt(): string` — 16 random bytes as hex.
- `verifyAccessCode(code: string, salt: string, expectedHash: string): Promise<boolean>` —
  constant-time-ish comparison of the generated hex strings.
- Web Crypto is available in browsers and Node 20+; no new dependency.

Verification: unit tests in `src/lib/access-code.test.ts` cover normalization, wrong code, and
hash stability.

## Phase 3 — Firestore rules and emulator config

### `firestore.rules`

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.schemaVersion == 1;

      allow update: if request.auth != null
        && request.resource.data.ownerId == resource.data.ownerId;

      match /{subcollection}/{documentId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

Notes:

- No project delete rule in v1; there is no delete UI.
- The Access Code is not enforceable in rules. Any signed-in account can read/write any project.
  This is the deliberate UI-only gate from ADR-0006.
- Subcollection reads/writes are allowed to any signed-in account.

### Emulator config

- `firebase.json` uses ports 9099 (Auth), 8080 (Firestore), 4000 (UI).
- `scripts/seed-emulator.mjs` creates `demo@example.com` / `demo1234` via `firebase-admin` when
  `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` is set. It is a convenience for manual emulator
  use; automated tests create the user through the Auth emulator REST API.
- `vitest.emulator.config.ts` includes `src/**/*.emulator.test.ts`, environment `node`, and reuses
  the `@` alias from `vite.config.ts`.

Verification: `firebase emulators:start --only auth,firestore` starts cleanly; rules tests pass.

## Phase 4 — Data modules on Firestore

Keep the existing module boundaries. Every read/write goes through the Firestore SDK.
Subcollections require the project id, so signatures change as listed.

### `src/lib/firestore-helpers.ts` (new)

- `projectRef(projectId)`, `projectCollection(projectId, name)`, `projectDoc(projectId, name, id)`
- `dataWithId<T>(snapshot): T | undefined` using `snapshot.id` and `snapshot.data()`
- `requireProjectId(projectId)` guard for test failures

### `src/db/projects.ts`

- `createProject(input, owner): Promise<CreatedProject>`
  - Generate id, salt, and access code.
  - Hash the code.
  - Write `projects/{id}` with `ownerId`, `ownerName`, `schemaVersion: 1`, `createdAt`, costs,
    stock.
  - Return `{ project, accessCode }`.
- `listProjects(): Promise<Project[]>`
  - `getDocs(collection(db, 'projects'))`, sort by `createdAt` descending in memory (or use
    `orderBy('createdAt', 'desc')`; both need no composite index).
- `getProject(id)` — `getDoc(projectRef(id))`.
- `verifyProjectAccess(id, code)` — fetch the project, return false when missing, otherwise
  `verifyAccessCode(code, project.accessCodeSalt, project.accessCodeHash)`.
- `updateProjectSettings(id, settings)` — `updateDoc` costs/stock, then return the fetched project
  or `undefined` if it does not exist.
- Keep `DEFAULT_COSTS`, `DEFAULT_STOCK`, `copyCosts`, `copyStock` unchanged.

### `src/db/members.ts`

- `listStructuralMembers(projectId)` — `getDocs(projectCollection(projectId, 'structuralMembers'))`,
  sort by `createdAt` if the current UI expects creation order.
- `updateStructuralMember(projectId, id, fields)` — fetch, `updateDoc` with normalized fields,
  return the updated entity or `undefined`.
- `deleteStructuralMember(projectId, id)` — `deleteDoc`.
- `updateLumberRequirement(projectId, id, fields)` — same pattern.
- `deleteLumberRequirement(projectId, id)` — `deleteDoc`.
- `createStructuralMember` / `createLumberRequirement` keep their input shape (which already
  contains `projectId`) and write to the subcollection.
- `groupLumberRequirementsByCrossSection` unchanged.

### `src/db/inventory.ts`

- `getPiece(projectId, id)`.
- `listPieces(projectId)` — read the `pieces` subcollection.
- `getActivePieces(projectId)` — unchanged filter over `listPieces`.
- `getUsageLog(projectId, pieceId)` — query the `usageLog` subcollection with
  `where('pieceId', '==', pieceId)`, then sort in memory by `date` desc and `createdAt` desc.
  Single-field index is automatic.
- `updatePiece(projectId, id, input)` — fetch, validate, `updateDoc`, return the fetched entity.
- `retirePiece(projectId, id)` — fetch, `updateDoc({ condition: 'Retired', retired: true })`,
  return the fetched entity.
- `addPiece(input)` — input already contains `projectId`; write to the subcollection.
- `recordUsage(pieceId, projectId, structuralMemberLabel, date)` — Firestore transactions do not
  work offline, so use a `writeBatch`:
  - Fetch the piece.
  - Reject missing, wrong-project, or retired pieces as today.
  - Compute `usageCount = piece.usageCount + 1` and the condition threshold from the fetched
    piece.
  - Batch `update(pieceRef, { usageCount: increment(1), condition })` and
    `set(usageLogRef, { id, pieceId, projectId, structuralMemberLabel, date, createdAt })`.
  - Commit. Return the refetched piece.
  - Accept the rare stale-threshold race: `increment(1)` preserves the count, but a concurrent
    offline edit can leave the condition at the other writer's value. Document this in the
    module.
- Keep `daysInInventory` and `queryPieces` unchanged.

### `src/db/plans.ts`

- `saveCuttingPlanSnapshot(projectId, snapshot, createdAt?)` — `setDoc` in the `cuttingPlans`
  subcollection with a generated id.
- `getLatestCuttingPlan(projectId)` — read the subcollection and reduce by `createdAt` in memory
  (or `orderBy` + `limit(1)`; either needs no composite index).
- Keep `filterCuttingPlanSnapshot`, `parseSnapshot`, and `LatestCuttingPlan` unchanged.

### `src/db/seed.ts`

- `seedDemoProject(owner): Promise<CreatedProject>`.
- Use a fixed project id such as `demo-project` so repeated clicks are idempotent. If the project
  already exists, return it with `accessCode: DEMO_ACCESS_CODE` and do not duplicate members or
  pieces.
- Keep `DEMO_PROJECT_NAME` and `DEMO_ACCESS_CODE = 'DEMO01'`.
- Hash `DEMO01` with a generated salt when first creating the project; do not store plaintext.
- Update all internal calls to the project-scoped signatures.
- Note: if a seed partially fails, the fixed id may leave an incomplete demo. The simplest
  recovery is to delete the `demo-project` document's subcollections in the console; no automatic
  repair in v1.

### Remove Dexie from the runtime data layer

- Move `src/db/db.ts` to `src/migration/legacyDb.ts`. Keep the Dexie schema/version and table
  names (`formwork-optimizer`, `projects`, `structuralMembers`, `lumberRequirements`, `pieces`,
  `usageLog`, `cuttingPlans`).
- Add `LegacyProject` with the old `accessCode` field in `src/migration/legacyTypes.ts`; use it
  only in the importer.
- No runtime code imports `dexie` except the importer.
- Keep the `dexie` dependency until the importer is removed in a follow-up release.

Verification: all data-module emulator tests pass; no runtime import of `src/db/db.ts` remains.

## Phase 5 — Authentication

### `src/auth/AuthProvider.tsx` (new)

- Export `AuthContext`, `AuthProvider`, `useAuth`, `RequireAuth`, and `AuthUser`.
- `AuthProvider` subscribes to `onAuthStateChanged`; state is
  `{ user: AuthUser | null, loading: boolean, error: string | null }`.
- `AuthUser` maps `uid`, `email ?? ''`, `displayName || email || 'Engineer'`.
- `RequireAuth` renders a full-screen loader while auth resolves, redirects to `/login` with
  `state.from` when signed out, and renders `<Outlet />` when signed in.

### `src/screens/LoginScreen.tsx` (new)

- Email and password form using the existing shadcn `Card`/`Input`/`Button`/`Label`.
- `signInWithEmailAndPassword(auth, email, password)`.
- Friendly errors for `auth/invalid-credential`, `auth/invalid-email`, and network failures.
- Demo hint: `demo@example.com / demo1234`, with a button that fills the fields.
- Redirect to `location.state?.from?.pathname ?? '/'` after success.
- If already signed in, redirect to `/`.

### Wiring

- `src/main.tsx`: wrap `<App />` in `<AuthProvider>` inside StrictMode.
- `src/App.tsx`:
  - `/login` public.
  - All other routes under `<RequireAuth />`.
  - Keep the existing nested project routes and catch-all.
- `src/components/AppLayout.tsx`: show the signed-in display name/email, a `SyncStatusChip`, and
  a sign-out button. `signOut(auth)`; `RequireAuth` handles the redirect.
- No registration link, password reset, or email verification in v1.

Verification: sign in with the demo user in the Auth emulator; refresh keeps the session; sign
out returns to `/login`; a deep link to `/projects/...` redirects to login and returns after
sign-in.

## Phase 6 — Screens and offline UX

### `src/lib/useRefreshSignal.ts` (new)

- Returns a number that increments on `focus`, `visibilitychange` (when visible), and `online`.
- Screens include the signal in their load effect dependencies.
- Apply to `ProjectsScreen`, `ProjectGate`, `StructuralMembersScreen`, `ProjectInventoryScreen`,
  `OptimizationScreen`, `ProjectSummaryScreen`, and any other screen that loads Firestore data.
  Do not auto-refresh `ProjectSettingsScreen` while the user has unsaved edits; it can keep
  mount-only loading.

### `src/screens/ProjectsScreen.tsx`

- Read the signed-in user from `useAuth`.
- `listProjects()` returns the global marketplace. Show:
  - project name, created date, owner name;
  - a `Mine` badge when `project.ownerId === user.uid`;
  - the existing static `Locked` badge.
- Subtitle becomes "Shared with every signed-in account" (or similar).
- Create flow stores `CreatedProject`; the "Save this access code" dialog shows
  `createdProject.accessCode` and `createdProject.project.name`. Closing it refreshes the list.
- Seed flow uses `seedDemoProject(user)` and the same dialog.
- Add a load-error state for failed reads (rules/network) and keep the demo-seed error.
- Run the one-time legacy import here (Phase 7) before the first list load; show a small
  "Importing local projects…" banner and an import error banner.
- Refresh on the refresh signal.

### `src/components/ProjectGate.tsx`

- Remove `liveQuery` and the `dexie` import.
- Fetch `getProject(projectId)` on mount and on refresh signal; do not flash the loader on a
  background refresh once a project is loaded.
- Keep the sessionStorage unlock behavior (`isProjectUnlocked`, `unlockProject`).
- Keep `verifyProjectAccess` for the code check. There is no owner bypass.
- Update the missing-project copy from "on this device" to "online".

### `src/components/inventory/PieceFormDialog.tsx`

- Call `updatePiece(projectId, piece.id, ...)`; `projectId` is already a prop.

### `src/components/inventory/PieceDetailDialog.tsx`

- Call `getUsageLog(piece.projectId, piece.id)` and `retirePiece(piece.projectId, piece.id)`.

### `src/screens/StructuralMembersScreen.tsx`

- Get the project from the outlet context (already used for `projectId`) and pass `project.id` to
  `updateStructuralMember`, `deleteStructuralMember`, `updateLumberRequirement`, and
  `deleteLumberRequirement`.

### `src/screens/ProjectInventoryScreen.tsx`

- Update any calls to the changed inventory signatures; pass `project.id`.

### Sync status

- `src/lib/syncStatus.ts` (new):
  - Module store with `status: 'offline' | 'syncing' | 'synced' | 'error'`,
    `lastSyncedAt: string | null`, `pending: number`, and subscribe/getSnapshot functions.
  - `trackWrite<T>(promise: Promise<T>): Promise<T>` increments `pending`, marks `syncing` when
    online, awaits, decrements, and calls `waitForPendingWrites(db)` when online to mark `synced`
    with a timestamp; sets `error` on failure.
  - Wire `onSnapshotsInSync(db, ...)` to set `synced` and the timestamp.
  - Listen to `online`/`offline`; offline overrides the visible status.
  - Start listeners once from `AuthProvider` (or `firebase.ts` guarded by a flag).
- Wrap each Firestore write helper in `trackWrite` so the chip reflects queued writes.
- `src/components/SyncStatusChip.tsx` (new): subscribes with `useSyncExternalStore`, renders a
  small badge:
  - `Offline` (gray)
  - `Syncing…` (amber)
  - `Synced · 14:32` (green)
  - `Sync error` (red)
- Place the chip in `AppLayout` and in `ProjectLayout` if that header is separate. Keep it
  compact on mobile.

### Firestore read/write behavior

- Reads come from the persistent local cache and update from the server on focus/reconnect.
- Writes queue offline and flush on reconnect.
- No `onSnapshot` listeners in v1; the refresh signal is the update mechanism.

## Phase 7 — Dexie migration importer

Files:

- `src/migration/legacyDb.ts`
- `src/migration/legacyTypes.ts`
- `src/migration/importLegacyData.ts` (new)
- `src/screens/ProjectsScreen.tsx` (trigger)
- `src/test/setup.ts` (remove global fake-indexeddb import)

Behavior:

1. After sign-in, if `localStorage.getItem('formwork.firestore-migration.v1')` is not `'done'`,
   start the import.
2. Read all legacy tables from Dexie.
3. Map projects to Firestore with `ownerId = user.uid`, `ownerName = user.name`,
   `schemaVersion: 1`; hash the legacy plaintext `accessCode` with a fresh salt; preserve
   `createdAt`, `costs`, and `stock`.
4. Map every child record into its project's subcollection, preserving IDs and `projectId`.
5. Write in batches of at most 400 operations with `setDoc` (idempotent; safe to retry).
6. Do **not** delete the Dexie database. Set the localStorage flag only after every batch
   succeeds.
7. On failure, leave the flag unset, show an error banner, and allow a retry (the next mount or a
   "Retry import" button).
8. Use a module-level promise so React StrictMode double-effects do not run two imports.
9. For projects with no legacy access code, generate one and hash it; log a warning in the UI?
   No — the legacy schema always has one. Keep the fallback simple.

Verification:

- Migration unit tests with `fake-indexeddb` + emulator: seed legacy rows, run the importer, assert
  Firestore docs, hashed codes, owner assignment, and the flag.
- No legacy DB: the flag is set and the app loads normally.
- Failure: the flag stays unset and the local DB is intact.

## Phase 8 — Tests

### Default Vitest suite (`npm test`)

- Keep all `src/engine/*` tests unchanged.
- Keep pure tests: `src/lib/*`, `src/pwa/manifest.test.ts`, formatting.
- Screen tests mock the data modules (`vi.mock('@/db/projects')`, etc.) and provide a test auth
  context.
  - Add `src/test/auth.tsx` with `TestAuthProvider` using the exported `AuthContext`.
  - Update `ProjectsScreen.test.tsx` for `CreatedProject` return values, owner badges, and the
    code dialog.
  - Update `ProjectGate.test.tsx` to mock `getProject` / `verifyProjectAccess`; remove Dexie
    setup.
  - Update `StructuralMembersScreen.test.tsx`, `ProjectInventoryScreen.test.tsx`,
    `OptimizationScreen.test.tsx`, `ProjectSummaryScreen.test.tsx`, and
    `ProjectSettingsScreen.test.tsx` to mock their data modules with fixtures.
- Remove `fake-indexeddb/auto` from `src/test/setup.ts`; import it only in migration tests.

### Emulator suite (`npm run test:emulator`)

- `src/test/emulator.ts` helper:
  - Initialize a dedicated Firebase app with project id `demo-test` and fake API key.
  - `connectAuthEmulator` / `connectFirestoreEmulator`.
  - Create/sign in the demo user via the Auth emulator REST API; handle an existing user by
    signing in.
  - `clearFirestore` and `clearAuth` helpers using the emulator REST endpoints.
- Convert/write `*.emulator.test.ts`:
  - `src/db/projects.emulator.test.ts` — create/list/get/verify/update, hashed code, no plaintext.
  - `src/db/members.emulator.test.ts` — CRUD in subcollections with project scoping.
  - `src/db/inventory.emulator.test.ts` — add/list/update/retire/usage batch, increment, threshold,
    wrong-project rejection.
  - `src/db/plans.emulator.test.ts` — save/latest/filter.
  - `src/db/seed.emulator.test.ts` — idempotent demo seed and access code.
  - `src/db/rules.emulator.test.ts` — unauthenticated denied; authenticated read allowed; create
    requires own `ownerId`; owner cannot be reassigned; subcollection write allowed; passcode is
    not enforced (documented test).
  - `src/migration/importLegacyData.emulator.test.ts` — end-to-end import.
- `vitest.emulator.config.ts` includes only `**/*.emulator.test.ts` and excludes them from the
  default run (via the default `vite.config.ts` test `exclude`).
- Emulator ports must match `firebase.json`. CI (if added later) runs `npm run test:emulator`.

Verification: `npm test` is fast and does not need Java; `npm run test:emulator` is green with the
Firebase emulator suite.

## Phase 9 — Documentation

- **ADR-0006** — done in this change.
- **ADR-0002** — add the superseded-data-layer note (done).
- **GLOSSARY.md** — add Account, Owner, Project Marketplace, Sync; revise Project and Access Code
  (done).
- **`docs/spec.md`**:
  - Update the problem/solution to mention accounts, marketplace, and cross-device sync.
  - Add user stories for Account sign-in and the Project Marketplace.
  - Update offline/PWA stories: local cache plus queued sync, not device-only.
  - Replace the "No backend, no sync, no auth server" architecture section with Firestore + Auth,
    the data shape, UI-only hashed Access Code, LWW, and refresh-on-focus.
  - Update testing decisions: default tests mock data modules; emulator suite for data/rules/
    migration; engine tests unchanged.
  - Out of scope: remove "cloud sync, multi-user, backend, user accounts"; add server-side
    passcode enforcement, client-side encryption, open registration (deferred), realtime
    collaboration, password reset, email verification, project deletion.
  - Further notes: demo account, one Firebase project, free-tier limits.
- **`README.md`**:
  - Describe the app as an offline-first PWA with cloud sync and accounts.
  - Quick start: install, copy `.env.example` to `.env.local`, fill Firebase config, `npm run dev`,
    sign in with `demo@example.com / demo1234`.
  - Explain Access Codes (shown once; not a security boundary; lost code is unrecoverable).
  - Offline behavior: first sign-in and first load need network; edits queue and sync.
  - Verification: `npm test`, `npm run test:emulator`, `npm run lint`, `npm run build`,
    `npm run verify:pwa`.
  - Deployment: Vercel env vars, SPA rewrite, deploy rules with
    `firebase deploy --only firestore`, add the Vercel domain to Auth.
  - Remove "all data stays on the device; there is no backend" statements.
- **`docs/firebase-setup.md`** (new): console steps, emulator usage, seeding the demo user,
  rules deployment, troubleshooting (authorized domains, offline cache, quotas).
- **`.env.example`** and script docs.

## Phase 10 — Deployment and smoke test

1. `npm run lint`, `npm test`, `npm run build`, `npm run verify:pwa`.
2. `npm run test:emulator`.
3. Deploy rules: `firebase deploy --only firestore:rules,firestore:indexes`.
4. Import the project into Vercel; set the six `VITE_FIREBASE_*` env vars for Production and
   Preview; build `npm run build`, output `dist`.
5. Confirm the Vercel domain is in Firebase Auth authorized domains.
6. Smoke test on the deployed URL:
   - Sign in with the demo account.
   - Create a project; the access code appears once; Firestore shows only the hash/salt.
   - Sign out and back in; the project is in the marketplace with the `Mine` badge.
   - Open it with the correct code; wrong code is rejected; the owner also needs the code.
   - Add members, pieces, and a cutting plan; edit settings.
   - Go offline, make edits, reload; edits persist locally; the chip shows `Offline`.
   - Reconnect; the chip shows `Syncing…` then `Synced`; another browser sees the changes after
     focus/refresh.
   - Load the demo data twice; no duplicate demo project.
   - Deep link to `/projects/...` after sign-in works.
   - Existing Dexie data imports once on the first signed-in load.

## Acceptance Criteria

- Demo login works; sign-out and protected routes work.
- The project list is global; `Mine` appears for owned projects.
- Creating a project returns and displays a six-letter code once; Firestore stores only a salted
  SHA-256 hash.
- Correct code unlocks; wrong code is rejected; the owner also needs the code.
- Two devices see each other's changes after focus/reconnect.
- Offline edits queue and sync on reconnect; the sync chip reflects offline/syncing/synced/error.
- Legacy Dexie projects import once and remain intact locally.
- Firestore rules require auth and enforce `ownerId` on create; tests cover the rules.
- Engine tests are unchanged and pass.
- `npm test`, `npm run test:emulator`, `npm run lint`, `npm run build`, and
  `npm run verify:pwa` pass.
- ADR-0006, ADR-0002 note, glossary, spec, README, and Firebase setup guide are updated.

## Risks and Deferred Decisions

- **UI-only Access Code**: any signed-in account can read/write any project through the SDK.
  Acceptable only for the prototype and demo account; revisit before real deployment.
- **Last-write-wins**: concurrent edits to the same document can overwrite each other; the usage
  threshold can be stale in a rare race.
- **No registration/reset**: only the demo account exists; lost access codes cannot be recovered.
- **No realtime listeners**: updates appear on focus/reconnect, not instantly.
- **Migration flag is per browser**: importing on a second browser would duplicate projects with
  new IDs if the legacy Dexie data exists there. The thesis demo uses one browser; document this.
- **Free-tier quotas**: Spark plan limits apply (reads/writes/storage); the prototype is small,
  but watch usage during demos.
- **Firestore offline cache**: persisted data is per browser profile; clearing site data clears
  the local cache until the next online load.
- **No project delete**: deleting a project in the console leaves subcollections orphaned; add a
  cascade (Cloud Function) only if project deletion becomes a requirement.
