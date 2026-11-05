---
date: 2026-11-05T14:49
---
<!-- 2026-11-05-1449 (November 05, 2026 02:49:59 PM) -->

❓ Q5 — Is the current greedy global packer good enough for the thesis?

The current allocator is **largest-board-first shelf FFD**. It considers all members, but it is not a global optimum.

A. Keep it; measure utilization on the three real projects; upgrade only if the numbers are poor.
B. Add a small search over board/panel orderings and pick the best result. Still guillotine-compatible, low-risk.
C. Move to MAXRECTS with the guillotine constraint now.

➡️ A for the first version, B as a cheap follow-up if real data shows weak utilization. C is a larger algorithm change and should be a separate decision.

- A is done, take note of B for future optimizations

## Follow-up: global packer ordering search

When baseline utilization on the three real projects is weak, implement option B: try several board/panel orderings in `allocatePanelsToPieces` / `packPanelsIntoStock` and keep the best guillotine-compatible result. Revisit MAXRECTS only if that still proves insufficient.
