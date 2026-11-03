# Persist optimization decisions in a project workflow document

The optimization screen used to keep its state in two places that were never designed for it: satisfied requirement IDs lived inside the latest cutting-plan snapshot, declines were local component state lost on every remount, and the engineer's position in the workflow had no representation at all. A guided two-step flow (reuse, then plan cuts) needs decisions to survive reloads and needs the summary to read them without depending on which plan record happened to be written last. We introduce a project-scoped workflow document as the live state of the optimization session, and demote cutting-plan records to generated audit artifacts.

## Decision

- **Location**: one document per project at `projects/{projectId}/workflow/optimization`. It is separate from the project document so that frequent workflow writes do not collide with settings and ownership updates under last-write-wins.
- **Contents**: satisfied requirement IDs, accepted piece per requirement, declined `requirementId::pieceId` keys, requirements explicitly planned from new stock, the current step, the timestamp the cut plans were reviewed, and a schema version.
- **Source of truth**: the summary and the optimization screen read satisfied decisions from the workflow document. Cutting-plan records remain append-only audit artifacts and are no longer read as live state.
- **Declines**: sticky per requirement and piece. Declining a piece for one requirement does not hide it for another. A reset clears declines and new-stock marks only; accepted matches are permanent because accepting writes a usage entry.
- **Invalidation**: on load, an accepted match whose piece no longer fits, or whose requirement no longer exists, is cleared from the workflow document but its usage entry is kept. The piece was physically used; the link is what became stale.
- **Compatibility**: if a project has no workflow document, derive satisfied IDs from the latest cutting-plan snapshot, treat declines and new-stock marks as empty, and start on the reuse step. No backfill migration.
- **Concurrency**: per-document last-write-wins, consistent with ADR-0006. Two devices editing the same project's workflow state can overwrite each other.

## Considered Options

- **Keep state in cutting-plan snapshots**: overloads an output as a workflow store, writes one record per accept, and makes the summary depend on UI history. Rejected.
- **Keep state local to the screen**: loses declines and cannot resume. Rejected.
- **Store the fields on the project document**: avoids a read but mixes high-churn workflow writes with settings and ownership, increasing last-write-wins collisions. Rejected.
- **Event log of every decision**: more machinery than the prototype needs; the usage log already records the physical event. Rejected.
- **Reset with compensating writes**: would decrement usage counts and delete usage entries. Rejected because usage entries must remain append-only; a usage record that can vanish is worse than a mistaken accept the engineer corrects in inventory.

## Consequences

- Reuse decisions and the current step survive reloads and are shared across devices.
- The summary works for projects with no accepted matches and no plan record.
- The workflow document is one more document to keep consistent; existing Firestore rules already permit authenticated access to project subcollections.
- Accepted decisions cannot be undone in-app. Correcting a mistaken accept means editing the piece in inventory; the usage log remains.
- Existing projects need no migration and degrade to the snapshot-derived state.
