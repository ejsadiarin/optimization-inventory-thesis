# Member-first planner workflow

Supersedes in part [ADR 0008](./0008-two-scope-planner.md): the scope toggle, Project scope as the default view, and `/optimize` → Project scope redirect.

Opening the Planner on Project scope showed every requirement at once in one narrow column. That was overwhelming, and the cutting plans sat below every requirement card, so engineers had to scroll to the bottom to see them. Decisions are made one member at a time, and the diagrams are the main feedback while deciding. So the Planner becomes a step-by-step flow that starts in Member scope.

## Decision

- **Member scope is the landing view.** The Planner opens on the first member that still needs a decision. There is no scope toggle.
- **Three-pane workspace.** The left rail lists members and a "Project-level lumber" entry, each with its own progress. The centre is a dense requirement list. The right pane is a sticky board viewer that stays visible while deciding and is linked to the list in both directions.
- **Project scope is a separate "Review & commit" step.** It has its own route and is reached by continuing once every rail entry is decided. It is also in the nav. Commit stays project-wide, as in ADR 0008. Old `?scope=project` and `/optimize` links redirect to it.
- **Project-level lumber is decided in the workspace**, as a final rail entry, not on the review page. This keeps the review page for review and commit only.
- **Bulk accept is per member and skips candidates that require cutting.** It records ordinary Reuse Decisions in the Plan Draft, so it changes nothing that per-requirement decisions don't already allow.

## Considered Options

- **Strict wizard (one step on screen at a time)**: rejected. It hides the cutting plans while deciding.
- **Keep Project scope as a tab, with Member scope as the default**: rejected. Engineers still meet the overwhelming view next to the decision step, and commit is a separate final step anyway.
