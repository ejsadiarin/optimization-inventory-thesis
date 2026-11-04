# Application User Flow & Schematic Mapping

This document describes the actual user flow of the **Formwork Cutting Optimization System** and maps each step to the project's original design specifications:
- [`schematic-diagram-flowchart.png`](../schematic-diagram-flowchart.png) (Thesis Section 3.4 Schematic Diagram)
- [`app-design-flow-specifics.png`](../app-design-flow-specifics.png) (UI Design & Flow Specifics Wireframe)

---

## 1. End-to-End User Flow Overview

```mermaid
flowchart TD
    A["1. Sign In (Firebase Auth)"] --> B["2. Project Marketplace"]
    B -->|"Create Project (Receive Code) or Select Existing"| C["3. Project Gate (Enter Access Code)"]
    C --> D["4. Project Workspace"]

    subgraph "Project Workspace Navigation"
        D --> M["Members Tab\n(Define C1, C2, B1, S1...)"]
        M -->|"Auto-Decompose into 2D panels & 1D lumber"| OPT_M["Optimize Step 1\nReuse Inventory\n(?step=reuse)"]
        
        D --> INV["Inventory Tab\n(Log Stock, Usage, Condition)"]
        INV -->|"Supply Active Pieces"| OPT_M
        
        OPT_M -->|"Accept Reuse Matches"| LOG["Record Usage & Increment Count"]
        OPT_M -->|"Unmatched Remainder"| OPT_C["Optimize Step 2\nPlan Cuts\n(?step=cuts)"]
        
        OPT_C -->|"Usable Offcuts (>= 0.3m in both dimensions)"| INV
        LOG --> D
    end
```

---

## 2. Step-by-Step Flow Walkthrough

### Phase 1: Sign-In & Project Access Gate
1. **Authentication (`src/screens/LoginScreen.tsx`):**
   - The user signs in with email/password (or demo credentials `demo@example.com` / `demo1234`).
2. **Project Marketplace (`src/screens/ProjectsScreen.tsx`):**
   - Users browse all workspace projects with **Mine** badges.
   - **Create Project**: Generates a project and displays a 6-character Access Code (e.g., `DEMO01`) **once**. Firestore only stores a salted SHA-256 hash. After saving the code, the new project opens on **Overview**, where the checklist starts with **Start with members**.
   - **Load Demo Data**: One-click idempotent button that seeds a sample two-storey residence.
3. **Project Unlock Gate (`src/components/ProjectGate.tsx`):**
   - Entering the access code verifies the salted hash client-side and unlocks the project for the browser session.

---

### Phase 2: Structural Members & Automated Decomposition
*(Directly implements the top bar of `app-design-flow-specifics.png` and Step 2 of `schematic-diagram-flowchart.png`)*

- **Overview checklist (`src/screens/ProjectOverviewScreen.tsx`):**
  - Shows five auto-derived steps: structural members (required), lumber requirements (optional), inventory (optional), reuse decisions (required), and cut plans reviewed (required).
  - Every row links to its screen, and the project tabs show completion checks or outstanding counts.
- **Screen:** `src/screens/StructuralMembersScreen.tsx`
- **Actions:**
  - Engineers define structural components: **Columns** (`C1`, `C2`), **Beams** (`B1`, `B2`), and **Slabs** (`S1`, `S2`) with length, width, depth, and quantity.
  - Manual 1D lumber requirements (walers, braces, joists, cleats) can also be added.
- **Under the Hood (`src/engine/decompose.ts`):**
  - The app automatically decomposes 3D structural dimensions into 2D flat contact formwork panels:
    - *Columns:* 4 rectangular phenolic side panels + lumber cleats.
    - *Beams:* 1 bottom soffit panel + 2 side panels + lumber bracing.
    - *Slabs:* Contact decking surface sheets.
  - Oversized panels exceeding standard stock (`2.44m × 1.22m`) are flagged with visual warnings.

---

### Phase 3: Digital Inventory Management & Condition Tracking
*(Directly implements the left panel of `app-design-flow-specifics.png` and steps 3–4 of `schematic-diagram-flowchart.png`)*

- **Screen:** `src/screens/ProjectInventoryScreen.tsx`
- **Features:**
  - **Material Logging:** Engineers register pieces with Material Type (Phenolic Board vs. Lumber cross-sections `2×2`, `2×3`, `2×4`), dimensions (Length, Width, Thickness), an optional label for site identification, Condition (`Good` or `For Inspection`), and Storage Location.
  - **Open a piece:** Selecting anywhere on a table row or card opens its detail; Edit stays a separate action.
  - **Usage Count & Inspection Threshold:** Tracks `usageCount`. When a piece reaches **5 uses**, the app flags it `For Inspection` (ADR-0004).
  - **Retire/Exclude:** Damaged pieces can be marked `Retired` to exclude them from the optimization algorithm.

---

### Phase 4: Step 1 — Reuse Inventory (Best-Fit Ranking)
*(Directly implements steps 5–7 of `schematic-diagram-flowchart.png`; deep link `?step=reuse`)*

- **Screen:** `src/screens/OptimizationScreen.tsx` (Optimize step: *Reuse inventory*)
- **Algorithm (`src/engine/match.ts`):**
  - Takes the decomposed requirements from Phase 2 and matches them against active pieces in inventory.
  - **Matching Criteria:** Same material type, sufficient dimensions (`piece.L >= req.L` and `piece.W >= req.W`), and non-retired condition.
  - **Ranking:** Uses a *Smallest-Fit* heuristic to prioritize pieces that fit with minimum leftover margin, preserving larger offcuts for bigger future panels.
- **User Interaction:**
  - Engineers review candidates grouped by structural member and can **Accept**, **Decline**, or mark a requirement as **Plan from new stock**. Decisions persist per project and survive reloads.
  - Accepting marks the requirement satisfied, increments the piece's `usageCount`, and records an entry in `usageLog` linked to that structural member (e.g. `C1`).

---

### Phase 5: Step 2 — Plan Cuts & Offcut Intake
*(Directly implements the right red box in `app-design-flow-specifics.png` and "Cutting Optimization for New Material"; deep link `?step=cuts`)*

- **Screen:** `src/screens/OptimizationScreen.tsx` (Optimize step: *Plan cuts*)
- **Segmented workspace:** Results are grouped into **Sheets**, **Lumber**, and **Offcuts** with counts. The step opens on Sheets when panels remain, otherwise Lumber, and visiting it records that cut plans were reviewed.
- **Unplaced detail:** Panels and lumber requirements larger than the configured stock are listed in an **Unplaced** section above the segments, even when no sheets can be produced. The same items feed the project notification drawer, and both link to stock settings.
- **Algorithm (`src/engine/plywood.ts` & `src/engine/lumber.ts`):**
  - Requirements not satisfied by existing inventory must be cut from new stock.
  - Uses 2D Shelf First-Fit Decreasing (ADR-0005) with strictly valid **Guillotine cuts** (ADR-0003) on standard 2.44m × 1.22m sheets.
- **Visual Cut Plan Sheet (`src/components/optimize/CutPlanSheet.tsx`):**
  - Renders interactive SVGs showing the exact layout of panels on each sheet with dimensions and member color tags.
  - Hatched regions display cutting waste and remaining usable offcuts.
  - Sheets can be exported as SVG or PNG images.
- **Offcut Intake (`src/components/optimize/OffcutIntake.tsx`):**
  - Offcuts meeting the thesis reuse threshold (≥ 0.3 m in both dimensions) are surfaced with a one-click **Add to inventory** button to feed back into inventory for future pours.
  - **Inventory CSV:** The Inventory screen exports every piece, including retired pieces and optional labels.

---

## 3. Diagram Comparison Matrix

| Step in `schematic-diagram-flowchart.png` | Element in `app-design-flow-specifics.png` | Corresponding Code / Screen | Status |
| :--- | :--- | :--- | :--- |
| **Create / Select Project** | Top project identifier (`P: 001`) | `src/screens/ProjectsScreen.tsx`, `src/components/ProjectGate.tsx` | **Full Match** |
| **Structural Member Dimensions** | Member bar (`C1: 1x1`, `C2: 0.8x0.8x2.4`) | `src/screens/StructuralMembersScreen.tsx` | **Full Match** |
| **Formwork Panel Decomposition** | Panel breakout (`0.3 x 2.4`) | `src/engine/decompose.ts` | **Full Match** |
| **Inspect and Record Material** | Left table (`DIM, TYPE, QTY, COND, USAGE`) | `src/screens/ProjectInventoryScreen.tsx` | **Full Match** |
| **Suitable for Reuse / Retire** | Condition filter & Retire action | `src/components/inventory/PieceDetailDialog.tsx` | **Full Match** |
| **Apply Matching Criteria & Rank** | `(C1) -> 1x1 => 003: 1x1, 007: 1.2x1` | `src/components/optimize/MatchGroups.tsx` & `src/engine/match.ts` | **Full Match** |
| **Update Digital Inventory (Usage Log)** | `1 USAGE`, `2 USAGE` arrows | `src/db/inventory.ts` (`recordUsage`) | **Full Match** |
| **Cutting Optimization for New Material** | 1.22m × 2.44m Plywood cutting layout | `src/components/optimize/CutPlanSheet.tsx` & `src/engine/plywood.ts` | **Full Match** |
| **Return Usable Offcut to Inventory** | Arrow from cutting sheet back to Inventory | `src/components/optimize/OffcutIntake.tsx` | **Full Match** |
