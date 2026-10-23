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

**Stock Sheet**:
An uncut, full-size piece of material purchased from a supplier. For phenolic board: 1.22m × 2.44m. For lumber: a standard-length piece with a fixed cross-section.
_Avoid_: Raw material, new material

**Offcut**:
The portion of a stock sheet left over after cutting. May be reusable if dimensions are sufficient.
_Avoid_: Waste (waste is an offcut too small to reuse), scrap, leftover

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

**Guillotine Cut**:
A cut that goes straight across the full width or height of the remaining piece, splitting it into two rectangles. The only type of cut the system generates, because this is how plywood is cut with a saw in practice.
_Avoid_: Free cut, arbitrary cut

**Match-and-Flag**:
The system's approach to reusing inventory pieces: find pieces with sufficient dimensions, rank them by smallest-fit-first, and flag pieces that need trimming as "requires cutting." The system does not generate a new cutting plan for reuse pieces.
_Avoid_: Cut-to-fit, auto-recut

**Shelf**:
A horizontal row of panels placed left-to-right on a stock sheet during cutting optimization. When a panel doesn't fit the current shelf, a new shelf starts below it. The shelf height is set by the tallest panel in that row.
_Avoid_: Row, layer, strip

**Usage Log**:
A per-piece record of each time a material is used as formwork. Each entry records which structural member it was used for, the date, and increments the usage count.
_Avoid_: Reuse history, usage record

**Piece**:
A single physical unit of material tracked individually in inventory. Each piece has its own ID, dimensions, condition, and usage count, even if identical pieces exist.
_Avoid_: Item, unit (when referring to tracked inventory)

**Stock Size**:
The dimensions of an uncut material as purchased. User-configurable per project, with standard defaults pre-populated (phenolic board: 1.22m × 2.44m; lumber: standard PH lengths per cross-section).
_Avoid_: Raw size, original size
