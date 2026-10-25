# Firestore cloud sync with accounts and a UI-only access code

The initial prototype was deliberately local-only (see ADR-0002): one browser, one IndexedDB database, no backend. We are now adding an online copy so an engineer can open the same project from another device, and a project marketplace so the prototype can demonstrate sharing. We use Firebase (Cloud Firestore + Firebase Auth) rather than Supabase or a bespoke API because Firestore ships the two things the prototype needs most: a persistent local cache that serves reads and queues writes while offline, and a client SDK that reconnects and flushes those writes without custom sync code. We keep React + Vite and deploy the static bundle to Vercel. Next.js would add a server tier that this prototype does not need.

## Decision

- **Data**: Firestore is the source of truth. Projects live at `projects/{projectId}`; structural members, lumber requirements, pieces, usage log entries, and cutting plans live in subcollections under the project. Dexie is kept only as a one-time importer and can be removed after migration.
- **Offline**: Firestore's persistent local cache (`persistentLocalCache` with `persistentMultipleTabManager`) replaces Dexie. Writes made offline are queued by the SDK and flushed on reconnect.
- **Accounts**: email/password only, no OAuth. v1 is login-only with a single pre-created demo account; open registration is deferred.
- **Marketplace**: every signed-in account sees every project in one global list, with a "Mine" badge on projects it owns. There are no per-user subcollections and no project-sharing UI.
- **Access Code**: the six-letter code is still shown once at creation, but only a salted SHA-256 hash is stored. Everyone, including the owner, must enter it each session. The check runs in the client. Firestore rules require authentication and require the creator's UID on project creation, but any signed-in account may read and write any project. The code is a guard against accidental access, not a security boundary.
- **Conflicts**: per-document last-write-wins. Usage log entries are append-only with client-generated IDs, and usage counts use `increment(1)` so concurrent increments are not lost. There is no conflict UI and no revision guard.
- **Freshness**: screens read on open and refetch on window focus or reconnect. v1 does not use realtime `onSnapshot` listeners.
- **Deployment**: one Firebase project for development and the deployed prototype (no separate production project). Vercel serves the Vite build with an SPA rewrite.

## Considered Options

- **Supabase + custom sync**: Postgres and row-level security are attractive, but offline-first behaviour would need a custom queue, conflict handling, and service-worker integration. Firestore provides that in the client SDK.
- **Keep Dexie and sync to a backend**: preserves the current data layer but requires writing and maintaining a sync engine, which is exactly the complexity this prototype should avoid.
- **Per-user subcollections**: stronger isolation, but it conflicts with the global marketplace and would still not make the Access Code enforceable.
- **Cloud Functions to verify the Access Code**: would make the code a server-side check, but adds a backend tier, cold starts, and emulator complexity for a prototype whose code is intentionally a UI gate.
- **Client-side encryption**: protects data from other signed-in accounts, but key management and recovery are out of scope and would make the prototype harder to demo.
- **Next.js on Vercel**: server components and API routes are unnecessary for a static SPA; Vite + Vercel is smaller and already works.

## Consequences

- Offline edits are safe from loss on the same device, but concurrent edits to the same document from two devices can overwrite each other (last write wins).
- The Access Code is not a security control. A signed-in account can read any project through the SDK. This is acceptable for a thesis prototype with a demo account and must be revisited before any real deployment.
- The first sign-in and first data load require a network connection. After that the app opens offline.
- Imported Dexie projects are assigned to the first account that signs in; the local database is left in place until the upload succeeds.
- Automated tests need the Firebase emulator suite for data, rules, and migration coverage; screen tests mock the data modules.
- Removing Dexie later is a separate change, after the migration has been validated.
