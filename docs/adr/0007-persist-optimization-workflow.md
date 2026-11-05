# Persist optimization decisions in a project workflow document

> **Superseded by [ADR-0008](./0008-two-scope-planner.md).** The `workflow/optimization` document and the Optimize screen are no longer read at runtime. The live state is now the project plan at `workflow/planner`. This record is kept for historical context.

The optimization screen used to keep its state in two places that were never designed for it: satisfied requirement IDs lived inside the latest cutting-plan snapshot, declines were local component state lost on every remount, and the engineer's position in the workflow had no representation at all. A guided two-step flow (reuse, then plan cuts) needs decisions to survive reloads and needs the summary to read them without depending on which plan record happened to be written last. We introduce a project-scoped workflow document as the live state of the optimization session, and demote cutting-plan records to generated audit artifacts.

## Decision

- **Location**: one document per project at `projects/{projectId}/workflow/optimization`. It is separate from the project document so that frequent workflow writes do not collide with settings and ownership updates under last-write-wins.
- **Contents**: satisfied requirement IDs, accepted piece per requirement, declined `requirementId::pieceId` keys, the current step, the timestamp the cut plans were reviewed, and a schema version. The mapping is many-to-many in practice: several requirements may name the same piece because the piece is nested as a small stock sheet.
- **Source of truth**: the summary and the optimization screen read satisfied decisions from the workflow document. Cutting-plan records remain append-only audit artifacts and are no longer read as live state.
- **Declines**: sticky per requirement and piece. Declining a piece for one requirement does not hide it for another. A reset clears declines only; accepted matches are permanent because accepting writes a usage entry.
- **New stock**: a requirement with no candidate, or whose candidates have no remaining space, is classified as new stock automatically. All-declined requirements remain no-match until a candidate is restored. New-stock classification is derived, not persisted, so it never goes stale.
- **Reuse allocation (schema v3)**: accepted requirements are grouped by piece and repacked into that piece's rectangle with the shelf packer. A piece can satisfy several panels of the same or different requirements when they fit, including after 90° rotation. Leftovers at least 0.30 m in both dimensions are reusable offcuts. Dimensions are exact; no saw kerf is modelled.
- **Invalidation**: on load, group accepted requirements by piece and drop groups whose piece is missing, retired, or of the wrong material. Requirements that no longer exist are dropped. The remaining requirements are packed into the piece, and only placements that still fit are kept. `satisfiedRequirementIds` is synced to the kept allocations, declines are untouched, and the usage log is never modified. If nothing changed, the same workflow object is returned.
- **Compatibility**: v2 documents stored the same requirement-to-piece mapping and are read as v3 allocations without a data migration; missing fields default to empty. If a project has no workflow document, derive satisfied IDs from the latest cutting-plan snapshot, treat declines as empty, ignore legacy new-stock marks, and start on the reuse step.
- **Usage**: a piece's usage count increments once per optimization session, not once per panel. The first accepted panel creates the usage entry; later accepted panels add their requirement IDs to that same entry.
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
