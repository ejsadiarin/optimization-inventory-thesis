# Formwork Cutting Optimization System — Spec

**Label**: `ready-for-agent`

---

## Problem Statement

Construction sites for two-storey residential buildings generate significant formwork material waste — particularly plywood (phenolic board) and lumber (coco lumber). Engineers cut stock sheets to fit structural members (columns, beams, slabs), but without systematic planning, cuts are suboptimal: usable offcuts get discarded, reusable pieces aren't tracked, and materials are purchased unnecessarily. There is no tool available to construction workers and site engineers that combines cutting optimization with inventory tracking for formwork materials on small-scale residential projects.

## Solution

A Progressive Web App that:

1. **Decomposes** structural members into the rectangular formwork panels they require
2. **Searches inventory** for reusable pieces that match those requirements, ranking by fit and flagging oversized pieces as "requires cutting"
3. **Optimizes the cutting** of new stock sheets to produce remaining panels with minimal waste, using a guillotine-constrained shelf-based algorithm
4. **Visualizes the cutting plan** as labeled, color-coded SVG rectangles on a stock sheet
5. **Tracks materials** across their lifecycle — from new stock through multiple uses to inspection and retirement
6. **Calculates savings** by comparing optimized sheet usage against naive usage, using project-specific material costs

The app is a PWA deployed on Vercel. Firebase Authentication provides sign-in, and Cloud Firestore is the source of truth with a persistent local cache that keeps projects usable offline. Writes made offline are queued and flushed when the device reconnects.

## User Stories

### Project Management

1. As a site engineer, I want to create a new project with a name, so that I can organize materials and structural members per construction site.
2. As a site engineer, I want to see a one-time access code when I create a project, so that I can control who opens the project on this device.
3. As a site engineer, I want to enter an access code to open an existing project, so that my project data is not accidentally modified.
4. As a site engineer, I want to see a list of all my projects, so that I can switch between active construction sites.
5. As a site engineer, I want to set material costs per project (e.g., ₱850 per phenolic board sheet, ₱120 per coco lumber piece), so that the system can calculate procurement savings.
6. As a site engineer, I want to configure custom stock sizes per project (overriding the defaults), so that I can account for non-standard materials on my site.

### Structural Members

7. As a site engineer, I want to add a column to my project by specifying its label (e.g., C1), length, width, and height, so that the system knows what formwork panels I need.
8. As a site engineer, I want to add a beam to my project by specifying its label (e.g., B1), length, width, and height, so that the system knows what formwork panels I need.
9. As a site engineer, I want to add a slab to my project by specifying its label (e.g., S1), length, and width, so that the system knows what formwork panels I need.
10. As a site engineer, I want to see the system automatically decompose my structural members into rectangular formwork panels (column → 4 panels, beam → 3, slab → 1), so that I don't have to calculate panel dimensions manually.
11. As a site engineer, I want to edit or remove structural members, so that I can correct mistakes or update the project plan.
12. As a site engineer, I want to see a warning when a required panel exceeds stock sheet dimensions, so that I know which panels need manual tiling on site.

### Lumber Requirements

13. As a site engineer, I want to manually enter lumber piece requirements (length and cross-section) for bracing and support, so that the system can optimize lumber cutting separately from plywood.
14. As a site engineer, I want lumber requirements grouped by cross-section, so that I can see all 2×3 cuts together and all 2×4 cuts together.

### Inventory Management

15. As a site engineer, I want to add a material piece to inventory by specifying its material type (Phenolic Board or Lumber), dimensions (L × W × thickness or length × cross-section), condition (Good or For Inspection), and storage location, so that I can track available materials.
16. As a site engineer, I want each piece tracked individually with its own ID, even if I have multiple identical pieces, so that I can track condition and usage per physical piece.
17. As a site engineer, I want to see a list of all inventory pieces with columns for ID, dimensions, type, condition, usage count, and storage location, so that I can quickly find materials.
18. As a site engineer, I want to search inventory by dimension, type, or storage location, so that I can find specific pieces quickly.
19. As a site engineer, I want to sort inventory by any column (dimension, condition, usage count, date added), so that I can organize the view.
20. As a site engineer, I want to filter inventory by material type, condition, and usage count range, so that I can narrow down to relevant pieces.
21. As a site engineer, I want to edit a piece's condition, storage location, and dimensions, so that I can keep records accurate after inspection.
22. As a site engineer, I want to retire a piece (soft delete), so that it disappears from active inventory but its history is preserved for reporting.
23. As a site engineer, I want to see a piece's full detail view showing all fields plus its complete usage log (which structural member, which date, for each use), so that I can make informed decisions about reuse.
24. As a site engineer, I want the system to automatically set a piece's condition to "For Inspection" when its usage count reaches 5, so that overused materials don't slip through unnoticed.
25. As a site engineer, I want to manually change a piece's condition back to "Good" after inspecting it, so that inspected pieces return to active inventory.
26. As a site engineer, I want to see how long each piece has been in inventory (days since date added), so that I can identify stale materials.

### Planner — Project Scope

27. As a site engineer, I want one Planner with Project and Member scopes, so that I can review the whole project or one member without switching screens.
28. As a site engineer, I want the Planner to compute one global allocation across every member and active phenolic piece, so that boards can serve panels from different members when the remaining space fits.
29. As a site engineer, I want inventory matches ranked by smallest-fit-first, so that the best match is at the top and material waste is minimized.
30. As a site engineer, I want oversized inventory matches flagged as "requires cutting", so that I know which pieces need trimming before use.
31. As a site engineer, I want to accept or decline each candidate, so that I control which pieces actually get used.
32. As a site engineer, I want reuse decisions to persist as a project draft across reloads without recording usage, so that I can review the plan before committing it.
33. As a site engineer, I want to commit the project plan in one action, so that every piece used by the plan records usage once and shared pieces name every member they serve.
34. As a site engineer, I want committed allocations locked, so that later packing cannot silently move a board I have already cut.
35. As a site engineer, I want to release a locked allocation explicitly, so that I can replan it without erasing its usage history.
36. As a site engineer, I want the system to show when a plan needs review after a member or inventory change, so that I know which allocations were released and why.
37. As a site engineer, I want to see each physical board as a cutting plan with labeled, color-coded panels, dimensions, utilization, waste, and reusable offcuts, so that I can follow the plan on site.
38. As a site engineer, I want to return reusable offcuts to inventory from Project scope, so that they are available for future matching.
39. As a site engineer, I want to export one board or every board as SVG or PNG, so that I can print the plan or include it in reports.
40. As a site engineer, I want Project scope to include project-level lumber and procurement totals, so that I can see the full material requirement in one place.

### Planner — Member Scope

41. As a site engineer, I want Member scope to filter the same global allocation to one member, so that I can review that member without hiding boards shared with other members.
42. As a site engineer, I want the selected member's panels highlighted and other members muted on each shared board, so that I can see exactly which cuts belong to the member.
43. As a site engineer, I want a member summary showing panel coverage and the number of distinct boards serving the member, so that I can judge that member's reuse performance.
44. As a site engineer, I want an Exclusive Member Plan toggle, so that a member's panels use only unshared inventory pieces and fall back to new stock when necessary.
45. As a site engineer, I want offcut return and exports to stay in Project scope, so that member views remain focused on that member's plan.

### Data Export

46. As a site engineer, I want to export the cutting plan visualization as an image, so that I can print it or include it in project reports.
47. As a site engineer, I want to export my inventory data as a CSV file, so that I can analyze it in a spreadsheet for the thesis evaluation.
48. As a site engineer, I want the Project scope to show procurement totals — boards used, sheets saved, utilization, and waste — so that I can evaluate system performance.

### Offline & PWA

49. As a site engineer, I want the app to keep working offline after the first successful load, so that I can use it on a construction site with no internet.
50. As a site engineer, I want to install the app to my device's home screen, so that it feels like a native app.
51. As a site engineer, I want my projects synced through Cloud Firestore while remaining cached locally, so that I can switch devices without losing work.

## Implementation Decisions

### Architecture

- **Greenfield PWA**: React + Vite + TypeScript, deployed on Vercel
- **Data and auth**: Firebase Authentication signs users in. Cloud Firestore is the source of truth and uses a persistent local cache, so reads work offline and queued writes flush on reconnect (ADR-0006).
- **UI**: shadcn/ui component library + Tailwind CSS. Mobile-first responsive design.
- **Visualization**: SVG for cutting plan diagrams. Color-coded per structural member, hatched patterns for waste vs. reusable offcuts.

### Module Structure

- **Optimization Engine**: a pure-function module with no React or Firestore dependencies. Single entry point takes requirements + stock sizes + inventory, returns match results + cutting plans + offcuts + stats. Internally composed of:
  - Structural member decomposer (type + dims → panel list)
  - Inventory matcher (requirements + inventory → ranked matches with flags)
  - 2D shelf-based FFD plywood optimizer (panels + stock size → placed panels + offcuts, guillotine-constrained, rotation-allowed)
  - 1D FFD lumber optimizer (lengths + stock lengths → assignments, grouped by cross-section)
  - Stats calculator (utilization %, waste %, savings based on cost settings)
- **Data Store**: Firestore repositories for projects, structural members, lumber requirements, pieces, usage log entries, the project plan, and cutting-plan snapshots. Thin CRUD — no business logic in the store.
- **UI Layer**: React components organized by screen. The Planner builds one `PlannerState` from members, lumber, pieces, and the persistent project plan; Project and Member scopes render projections of that state. Components call the engine and read/write the repositories. No business logic in components beyond form validation.

### Cutting Optimization — Plywood (2D)

- **Algorithm**: Shelf-based First-Fit Decreasing Height
  - Sort panels by height descending
  - For each panel (try both orientations if rotation improves fit): place in the first shelf with enough remaining width; if no shelf fits, open a new shelf
  - When a shelf's bottom edge + height exceeds the stock sheet height, spill to a new stock sheet
- **Constraints**: guillotine cuts only (shelves are inherently guillotine-compatible), rotation allowed (90°), no kerf
- **Stock size**: 1.22m × 2.44m default, user-configurable per project

### Cutting Optimization — Lumber (1D)

- **Algorithm**: First-Fit Decreasing
  - Group requirements by cross-section (exact match required)
  - Within each group: sort by length descending, assign each to the first stock piece with remaining capacity
- **Stock lengths**: pre-populated with standard PH sizes (2.4m, 3.0m, 3.6m, 4.8m, 6.0m), user-configurable

### Inventory Matching

- **Criteria**: material type must match, both dimensions must be ≥ requirement, condition ≠ Retired, cross-section must match exactly for lumber
- **Ranking**: smallest-fit-first (minimize dimension surplus)
- **No upper limit** on oversized matches; all shown, best first
- **Flagging**: pieces larger than the requirement in either dimension are flagged "requires cutting"
- System does NOT generate a re-cutting plan for reuse pieces (match-and-flag, not cut-to-fit)

### Structural Member Decomposition (plywood only)

- Column (L × W × H) → 4 panels: 2× (L × H) + 2× (W × H)
- Beam (L × W × H) → 3 panels: 1× (L × W) bottom + 2× (L × H) sides
- Slab (L × W) → 1 panel: L × W
- Panels exceeding stock sheet dimensions in either direction trigger a warning, not auto-tiling
- Lumber requirements are entered manually by the engineer

### Condition State Machine

- Three values: **Good**, **For Inspection**, **Retired**
- Auto-trigger: usage count reaches 5 → condition set to "For Inspection"
- Manual transitions: Good ↔ For Inspection (by engineer after inspection), any → Retired (terminal, soft delete)
- Retired pieces are hidden from active inventory and matching but preserved in the database

### Per-Piece Tracking

- Each physical piece is a separate record (no quantity grouping)
- Fields: ID, project, material type, L, W, thickness (plywood) or length + cross-section (lumber), condition, usage count, storage location (free text), date added, soft-deleted flag
- Usage log: per-piece, each entry records structural member + date

### Project Access

- One-time access code generated at project creation, displayed once
- Access is checked client-side against a salted hash stored in Firestore; it is a guard against accidental access, not a security boundary.
- Project data is stored in Cloud Firestore under `projects/{projectId}` and cached locally for offline use.

### Cost and Savings

- Cost per material type configured as a project setting (e.g., ₱850/phenolic sheet, ₱120/lumber piece)
- Savings = (sheets needed without optimization − sheets used with optimization) × cost per sheet
- Displayed on the optimization results screen and in summary stats

## Testing Decisions

### What makes a good test

Tests should verify **external behavior** — what the user or caller observes — not implementation details. A test should survive an internal refactor (e.g., swapping shelf FFD for MAXRECTS) without breaking, as long as the output is still correct. Tests should use realistic domain data (real plywood dimensions, real structural member sizes) to catch edge cases that synthetic data misses.

### Seam 1: Optimization Engine (unit tests)

Test the engine's public API: `optimize(requirements, stockSizes, inventory) → results`

Key behaviors to test:
- **Decomposition correctness**: column → 4 panels with correct dimensions, beam → 3, slab → 1
- **Matching accuracy**: correct type and dimension filtering, smallest-fit-first ranking, "requires cutting" flagging on oversized pieces, retired pieces excluded
- **Plywood optimization**: panels fit within stock sheet bounds, all panels are placed, utilization is reasonable (>80% for typical inputs), guillotine constraint respected (shelves), rotation used when beneficial, multi-sheet spillover works
- **Lumber optimization**: pieces grouped by cross-section, all pieces assigned, FFD produces reasonable stock usage
- **Oversized panel warning**: panels larger than stock sheet flagged, not silently dropped
- **Stats calculation**: utilization %, waste %, savings math is correct
- **Edge cases**: single panel that exactly fills a sheet, panel that's 1mm smaller than the sheet, empty requirements list, no inventory, all inventory retired

### Seam 2: App Screens (React Testing Library)

Test each screen through user interaction:
- **Projects List**: create project → see access code → project appears in list. Enter wrong code → rejected. Enter correct code → project opens.
- **Structural Members**: add column with dimensions → appears in list with correct decomposed panels shown. Edit → values update. Delete → removed.
- **Inventory**: add piece via form → appears in list. Edit condition → updates. Retire → disappears from active list. Search → filters correctly. Piece at 5 uses → condition auto-changes to "For Inspection."
- **Planner**: open Project scope → see the global allocation and shared boards → accept and decline candidates → reload and confirm the draft persists without usage → commit and confirm each piece records usage once → release an allocation and confirm history remains → retire a committed board and confirm Needs Review → open Member scope and confirm the selected member's panels are highlighted → enable Exclusive Member Plan and confirm shared boards are excluded → return an offcut and export boards in Project scope only.
- **Export**: CSV export produces valid CSV with all inventory fields. Stats screen shows correct numbers.

### Test tooling

- **Vitest** for unit tests (fast, Vite-native)
- **React Testing Library** + **jsdom** for component tests
- **Vitest mocks and the Firebase emulator** for repository and plan tests; `fake-indexeddb/auto` remains for the legacy Dexie importer tests.

## Out of Scope

- iOS App Store / Google Play Store publishing
- CSV import
- Auto-tiling for panels larger than a stock sheet
- Automatic lumber decomposition from structural members (lumber cuts entered manually)
- Kerf (blade width) accounting in cutting optimization
- Genetic algorithm or other advanced optimization beyond shelf-based FFD
- Irregular (non-rectangular) shapes
- Post-deployment maintenance beyond a 2-week bug-fixing window
- Material photos or camera integration
- Notification system for expiring or degraded materials

## Further Notes

- **Thesis context**: this is a prototype for a DLSU-D Civil Engineering thesis. It will be tested on 3 real two-storey residential construction sites. The evaluation criteria are: accuracy of material matching, waste reduction compared to unoptimized cutting, and potential procurement savings. All three metrics must be extractable from the app (via summary stats and CSV export).
- **Material types are fixed at two**: Phenolic Board (plywood) and Lumber (coco lumber). The thesis scope limits this explicitly.
- **Structural member types are fixed at three**: Column, Beam, Slab. Footings and stairs are excluded from the prototype.
- **Algorithm upgrade path**: v1 keeps largest-board-first shelf FFD with 90° rotation. A follow-up may search several board/panel orderings and keep the best guillotine-compatible result; MAXRECTS with a guillotine constraint is a separate later decision. The optimization engine's public API won't change — only the internal algorithm.
- **The system is advisory, not authoritative**: the schematic diagram shows that material reuse is "subjected to review and approval of an onsite in charge civil engineer." The system suggests; the engineer decides.
- **Reference documents**: [GLOSSARY.md](../GLOSSARY.md) for canonical terminology, [docs/adr/](../docs/adr/) for architectural decisions, thesis PDF for full academic context.
