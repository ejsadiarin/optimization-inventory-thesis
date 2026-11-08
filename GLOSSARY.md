# Formwork Cutting Optimization System

A system for optimizing the cutting of formwork materials (plywood and lumber) for two-storey residential building construction, and tracking their reuse across a project.

## Language

**Structural Member**:
A concrete element of the building that requires formwork — a column, beam, or slab.
_Avoid_: Part, location, section

**Formwork Panel**:
A single rectangular piece of material that covers one face of a structural member during concrete pouring.
_Avoid_: Sheet, board, piece (when referring to a panel specifically)

**Cutting Plan**:
The arrangement of required formwork panels on a stock sheet or length, optimized to minimize waste.
_Avoid_: Cutting pattern (ambiguous with the algorithm's internal "pattern"), layout

**Project Plan**:
The persistent record of a project's reuse decisions and lifecycle. It holds the plan draft, committed allocations, declines, placements, and invalidation warnings, and is distinct from the cutting plans it produces.
_Avoid_: Optimization session, run, pass, job, workflow

**Stock Sheet**:
An uncut, full-size piece of material purchased from a supplier. For phenolic board: 1.22m × 2.44m. For lumber: a standard-length piece with a fixed cross-section.
_Avoid_: Raw material, new material

**Offcut**:
The portion of a stock sheet left over after cutting. May be reusable if dimensions are sufficient.
_Avoid_: Waste (waste is an offcut too small to reuse), scrap, leftover

**Reusable Offcut**:
An offcut whose length and width both meet the minimum reusable dimension (0.3 m), making it eligible to be returned to inventory for future pours.
_Avoid_: Scrap, waste, leftover

**Material Type**:
One of two categories of formwork material: Phenolic Board or Lumber.
_Avoid_: Material kind, category

**Condition**:
The physical state of a material piece, assessed by the engineer. Values: Good, For Inspection, Retired.
_Avoid_: Status (status refers to whether a piece is in inventory or used), state, Fair

**Usage Count**:
The number of times a material piece has been used as formwork. At 5 uses the system automatically flags the condition as "For Inspection."
_Avoid_: Reuse count, number of uses (in prose — use "usage count" consistently)

**Project**:
A single construction project with its own set of structural members, inventory, and cutting plans. Owned by an Account, listed in the Project Marketplace, and protected by an Access Code.
_Avoid_: Site, job

**Access Code**:
A six-letter code shown once at project creation and required each session by everyone, including the Owner, to open the project. It is a client-side gate, not a security boundary — it prevents accidental access, not access by a signed-in Account using the database directly.
_Avoid_: Passcode, password, PIN

**Account**:
An authenticated identity (email and password) that signs in to the system, browses the Project Marketplace, and opens projects with an Access Code.
_Avoid_: User (in domain prose), login, profile

**Owner**:
The Account that created a Project. Ownership does not bypass the Access Code.
_Avoid_: Creator, author, admin

**Project Marketplace**:
The global list of all Projects visible to every signed-in Account.
_Avoid_: Directory, catalog, shared workspace

**Sync**:
The process of reconciling this device's local copy of the data with the online database. Changes made offline are queued and applied when the device reconnects; conflicting edits to the same record are resolved last-write-wins.
_Avoid_: Replication, backup

**Column**:
A vertical structural member with length, width, and height. Decomposes into 4 formwork panels (the 4 sides).
_Avoid_: Post, pillar

**Beam**:
A horizontal structural member spanning between columns, with length, width, and height. Decomposes into 3 formwork panels (bottom + 2 sides).
_Avoid_: Girder, lintel

**Slab**:
A flat horizontal structural member (floor or roof). Decomposes into 1 formwork panel (the bottom).
_Avoid_: Floor, deck

**Lumber Requirement**:
A single 1D cut needed for bracing, walers, joists, or cleats, defined by length and cross-section (2×2, 2×3, or 2×4). A lumber requirement may be linked to one Structural Member or stay project-level.
_Avoid_: Lumber piece (that is a tracked inventory item), lumber input

**Member-linked Lumber**:
A Lumber Requirement whose `memberId` points to a Structural Member. It appears in that member's Member Scope alongside the member's formwork panels.
_Avoid_: Member lumber, attached cut

**Project-level Lumber**:
A Lumber Requirement with no `memberId`. It is not tied to a single member and appears in Project Scope.
_Avoid_: Unassigned lumber, global lumber

**Guillotine Cut**:
A cut that goes straight across the full width or height of the remaining piece, splitting it into two rectangles. The only type of cut the system generates, because this is how plywood is cut with a saw in practice.
_Avoid_: Free cut, arbitrary cut

**Match-and-Flag**:
The system's approach to reusing inventory pieces: find pieces with sufficient dimensions, rank them by smallest-fit-first, and flag pieces that need trimming as "requires cutting." Accepted panels are then nested into the chosen piece by the reuse allocator.
_Avoid_: Cut-to-fit, auto-recut

**Reuse Decision**:
The engineer's explicit choice about a formwork requirement: accept a candidate inventory piece or decline a candidate. An accepted candidate assigns the requirement in the plan draft; usage is recorded only when the plan is committed. A declined candidate is not offered again for that requirement until decisions are reset. A requirement with no available candidate is classified as new stock automatically rather than by an explicit action.
_Avoid_: Match, selection (when referring to the engineer's decision)

**Requirement Status**:
The review state of a formwork or lumber requirement in the planner: Needs Decision, Satisfied, New Stock, Exceeds Stock, or No Match. Satisfied means the requirement is covered by a reuse allocation; whether that allocation is draft or committed is tracked by the plan, not by this status.
_Avoid_: Status (unqualified), state

**Plan Draft**:
The editable assignment of requirements to inventory pieces before the engineer commits it. Draft assignments do not record usage or change inventory.
_Avoid_: Unsaved plan, preview (a preview is read-only; a draft is editable)

**Committed Plan**:
The plan state after the engineer commits the draft. Each piece used by the plan records one usage event, and every member served by a shared piece is recorded on that event.
_Avoid_: Saved plan, final plan

**Plan Status**:
The lifecycle state of a plan: Draft, Committed, or Needs Review. A plan becomes Needs Review when a committed allocation is invalidated by a change to a member or inventory piece.
_Avoid_: State, phase

**Locked Allocation**:
A committed reuse allocation that later global packing may not move. It can only be changed by explicitly releasing it.
_Avoid_: Frozen allocation, fixed match

**Release**:
The engineer's explicit action that frees a locked allocation for replanning. Usage already recorded is not reversed.
_Avoid_: Uncommit, undo

**Panel Coverage**:
The share of a structural member's formwork panels covered by reused inventory rather than new stock. It is a member summary metric, not a procurement count.
_Avoid_: Reuse rate, utilization (utilization is an area metric)

**Member Scope**:
The Planner view filtered to one structural member: its formwork panels, its member-linked lumber, and the boards that serve them. A shared board is shown in full, with the selected member's panels highlighted. It is where the engineer makes reuse decisions, one member at a time, before moving on to Project Scope.
_Avoid_: Member tab, focus mode

**Project Scope**:
The Planner view of the whole project's global allocation: every member's requirements, project-level lumber, new stock, and offcuts, grouped by physical board. It is the final review step, where the plan draft is committed; the UI labels it "Review & commit".
_Avoid_: Global mode, optimize tab

**Exclusive Member Plan**:
A member plan whose panels are packed only into inventory pieces that are not shared with other members. Used when a member's panels must be cut and used independently.
_Avoid_: Opt-out, locked member

**Reuse Allocation**:
The placement of one or more formwork panels inside a reusable inventory piece, treating the piece as a small stock sheet. The allocator uses shelf packing with 90° rotation, records each panel's position and dimensions, and reports the leftover rectangles. A single piece may satisfy several requirements, but no panel is assigned twice and placements never overlap. Usage is counted once per piece when the plan is committed; leftovers at least 0.30 m in both dimensions are reusable offcuts. Dimensions are exact and include no saw kerf or blade allowance.
_Avoid_: One-piece-per-panel assignment, reuse match (a match is only a candidate; an allocation is the accepted placement)

**Shared Piece**:
An inventory piece whose reuse allocation covers formwork panels from more than one structural member. Usage is counted once for the piece, while the usage log records every member it served.
_Avoid_: Shared sheet, shared material

**Piece Availability**:
The state of an inventory piece within a plan: Available, In Use, or Shared. It is distinct from the piece's Condition and Usage Count.
_Avoid_: Status (unqualified), condition, Reserved (no reservation concept yet)

**Shelf**:
A horizontal row of panels placed left-to-right on a stock sheet during cutting optimization. When a panel doesn't fit the current shelf, a new shelf starts below it. The shelf height is set by the tallest panel in that row.
_Avoid_: Row, layer, strip

**Usage Log**:
A per-piece record of each time a material is used as formwork. Each entry records the date and increments the usage count; for a shared piece, it records every structural member and requirement the piece served.
_Avoid_: Reuse history, usage record

**Piece**:
A single physical unit of material tracked individually in inventory. Each piece has its own ID, dimensions, condition, and usage count, even if identical pieces exist. An optional label lets the engineer name it for the site (for example, "Left wall panel").
_Avoid_: Item, unit (when referring to tracked inventory)

**Stock Size**:
The dimensions of an uncut material as purchased. User-configurable per project, with standard defaults pre-populated (phenolic board: 1.22m × 2.44m; lumber: standard PH lengths per cross-section).
_Avoid_: Raw size, original size
