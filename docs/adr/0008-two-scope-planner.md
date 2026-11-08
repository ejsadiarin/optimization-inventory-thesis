# Replace Overview and Optimize with a two-scope Planner

> Superseded in part by [ADR 0009](./0009-member-first-planner-workflow.md): Member scope is now the landing view and Project scope is a separate Review & commit step.

> Implementation plan: [`docs/plans/two-scope-planner.md`](../plans/two-scope-planner.md).

The project had three overlapping screens: Overview, Optimize, and Member planner. Optimize packed the whole project; Member planner packed one member in isolation; Overview presented a checklist over both. The split forced engineers to pick a screen instead of a scope, hid cross-member sharing from the member view, and duplicated allocation logic with different semantics. Because the product's primary objective is material utilization, the whole project must be packed as one allocation.

## Decision

- **One Planner screen, two scopes.** Member scope and Project scope switch the view of one Planner. Project scope computes the project-wide global allocation; Member scope is a filtered projection of that same allocation, not an independent packer.
- **Remove Overview and Optimize.** Planner is the project landing route and nav item. Old `/optimize` links redirect to Project scope; old `/focus` links redirect to Member scope. Checklist, next-action, and overview-only stock summaries are removed.
- **Project scope owns the whole-procurement view.** It contains the global phenolic allocation across members, project-level lumber, new-stock cutting plans, offcut return, and exports. Member scope contains the selected member's panels, member-linked lumber, and the boards serving that member, with the member's panels highlighted and other members muted.
- **Cross-member sharing is the default for phenolic panels.** An Exclusive Member Plan opts a member out; its panels use only unshared pieces, otherwise new stock. Lumber reuse remains one requirement per piece.
- **One project plan, draft then commit.** The draft persists across reloads and records no usage or inventory changes. Commit is project-wide and records one usage event per piece, naming every member and requirement the piece serves. Re-committing does not increment usage again unless the piece was released and re-added.
- **Committed allocations are locked.** Later packing works around them. Only an explicit Release frees a locked allocation. The usage log is append-only; releasing or removing a piece never decrements usage.
- **Invalidation is explicit and actionable.** A member edit, piece retirement, or piece dimension change releases only the affected allocations, returns their requirements to Needs Decision, sets the plan to Needs Review, and shows a warning naming the cause.
- **Reset existing optimization decisions.** The new Planner starts empty. Old workflow documents and snapshots are ignored, with no migration code.
- **Keep the greedy packer for v1.** Largest-board-first shelf FFD with 90° rotation stays. A search over board/panel orderings is a documented follow-up; MAXRECTS is a separate later decision.
- **Keep the UI vocabulary physical.** Diagrams are "Cutting plans", phenolic stock is a "Board", and lumber, offcuts, or general units are "Pieces". The glossary retains Stock Sheet as the technical term.

## Considered Options

- **Keep Optimize and Member planner as separate screens**: rejected because scope is a view, not a separate workflow. It duplicates packing and hides cross-member opportunities from the member view.
- **Let Member scope run its own packer**: rejected. `allocationsForAssignments()` only sees the requirements passed to it, so a member-only packer would double-book pieces already used by other members.
- **Commit per member**: rejected. A shared piece would receive repeated usage events, and ownership of the committed allocation would be ambiguous.
- **Mutate committed allocations when inputs change**: rejected. Silent reshuffles make the plan untrustworthy; invalidation must be visible and require a decision.
- **Migrate old workflow documents**: rejected. The data is disposable, and the old semantics (accepting a match recorded usage) conflict with draft/commit.

## Consequences

- `ProjectOverviewScreen`, `OptimizationScreen`, the checklist, and the next-action logic can be deleted rather than kept in sync with the Planner.
- `projectProgress` and the notification bell must be rebuilt around one plan and its draft state instead of the old reuse/cuts workflow.
- Member scope can no longer compute new-stock plans from `selected.panels` alone; it must filter the global plan so occupancy by other members stays visible.
- `allocationsForAssignments()` must always receive every project requirement; passing a member subset is now a correctness bug.
- Shared-piece usage needs `structuralMemberLabels: string[]` on the usage entry while keeping `structuralMemberLabel` for compatibility.
- Old optimization decisions are lost. This is acceptable because existing data is disposable and the prototype is being reset.
