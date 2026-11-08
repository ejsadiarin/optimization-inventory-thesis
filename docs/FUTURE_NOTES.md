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

## Packer validation baseline (2026-11-08)

Synthetic representative projects (two-storey residence, mid-rise frame, complex podium) packed with the current largest-board-first shelf FFD and no reuse:

| Project | Panels | Sheets | Utilization | Waste | Lumber utilization |
|---|---:|---:|---:|---:|---:|
| Two-storey residence | 53 | 19 | 85.2% | 11.7% | 67.4% |
| Mid-rise frame | 100 | 40 | 95.1% | 4.9% | 85.0% |
| Complex podium | 146 | 58 | 87.3% | 11.8% | 83.1% |

Baseline is acceptable. Do not add ordering search or MAXRECTS yet. Re-run against the three real projects when their data is available; if any drops well below this range, implement option B first.
