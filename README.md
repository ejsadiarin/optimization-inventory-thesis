# Formwork Cutting Optimization System

Offline-first PWA for planning formwork cuts, matching reusable inventory, and tracking phenolic board and lumber usage across construction projects. Sign-in uses Firebase Authentication, and local project data still lives in IndexedDB while cloud sync is rolled out.

## Quick start

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Sign in with `demo@example.com` / `demo1234`.

### Local development with the Firebase emulator

The default `.env.example` sets `VITE_USE_FIREBASE_EMULATOR=true` and leaves the
`VITE_FIREBASE_*` values blank, so no real Firebase project is required. Start the
emulators, seed the demo account, then run the app:

```bash
npx firebase emulators:start --only auth,firestore --project demo-test
npm run seed:emulator
npm run dev
```

1. Sign in, then create a project and save the one-time access code shown after creation (it cannot be recovered). Or click **Load demo data** to populate a realistic project; its access code is `DEMO01`.
2. Add structural members (columns, beams, slabs) and any manual lumber requirements.
3. Add reusable phenolic boards and lumber pieces to inventory.
4. Open **Optimize** to accept reuse matches, review SVG cut plans, and keep reusable offcuts.
5. Open **Summary** to review utilization, waste, reuse, and PHP savings, then export inventory CSV or cutting-plan images.

The app is installable and works offline after the first successful load. Data is local to the browser profile; clearing site data removes projects.

## Verification

```bash
npm test              # Vitest unit and component tests
npm run test:emulator # Firebase Auth/Firestore emulator tests
npm run test:all      # both suites
npm run lint
npm run build         # TypeScript + production build
npm run verify:pwa    # checks manifest, service worker, and icons
```

To test the production/PWA build locally:

```bash
npm run build
npm run preview
```

## Project docs

- [GLOSSARY.md](./GLOSSARY.md) — canonical domain terms
- [docs/adr/](./docs/adr/) — architecture decisions
- [docs/spec.md](./docs/spec.md) — product spec

---

# Historical README (deprecated, kept for context)

```md
# Offcut Utilization Inventory System

- Paper title: "Development of an On-Site Formwork Reuse and Offcut Utilization Inventory System for Two-Storey Residential Buildings"
    - In the context of two-storey residential buildings

---

## System Design (App-specific)

Given:
- "Data" - "kulang 2m sa corner (wood material type)", "need ng 1m na plywood sa roof part na to"
- Raw material - the thing we need to optimize (what we are working with)

**Goal**: Find a way to optimize where to utilize the raw material - on what "location", etc. to SAVE COSTS

Basically - like fill in the blanks with the "correct", optimized material (dimension, type, condition)

**RAW note:**
> Ex : may mga tira na (6m length , 2m length , 3 m length )
> tapos yung gagawing prototype , irerecommend niya based sa provided na dimensions 
> kung san best yung 6 m length , based sa provided na cutting list dimensions

## To be stored in the database
- stores Offcut (as records)
    - material type
    - quantity
    - condition of material
    - dimension - throw away if 0.5m
        - height
        - width
        - thickness
    - "location" or part - where to put based on the data (ex. Top, Bottom, etc.)
        - location can be different from part (ex. column 1 right side, corner, etc.) - **TBA need more details**
        - this is given already - **TBA need more details**
    - expiry date
    
## Flow

Get raw material from construction company (any length/size, bought in bulk) - process this/optimize

1. Give length of the wood offcut (tira) - ex. 5m length
2. Process - calculation/mapping of offcut to ideal "location"
3. Store to db - recommend optimized way to put it where (for efficiency and save cost)
    - excess wood (offcuts) can be used in any "location"

## Definition of terms

- Centralized inventory system - A cloud-based digital system that gathers and organizes material information, stock levels, and transaction records in one centralized online platform. It allows authorized users to access and update inventory data in real time, regardless of their location, providing consistent records and efficient monitoring of materials across the organization.

- Condition - This refers to the physical state of an offcut or recoverable material, such as its level of damage, usability, or suitability for potential reuse.

- Digital Inventory System - This refers to the developed computerized system used to record, organize, monitor, and retrieve information about usable construction offcuts and recoverable materials.

- Formwork Offcuts - These refer to remaining pieces of plywood or other formwork materials produced after cutting or adjusting them to required dimensions for concrete construction.

- Inventory - This refers to the organized record of available formwork, plumbing, and carpentry offcuts and recoverable materials, including their type, dimensions, quantity, condition, and storage location.

- Offcut - This refers to the portion of a construction material left after the material has been cut to the required size or shape for a particular construction activity.

- Reclaimed wood construction projects - Reclaimed wood is a sustainable material with a renewable and unique customized nature, and the reclaimed wood esthetics and urban wood esthetics that represent nature make recycled wood products stand out from the competition in recycled products

## Conceptual Framework

![conceptual-framework](./conceptual-framework.jpg) 

---

## Scope
- mobile application, offline-support (sqlite)
- APK, source code, app demo

### Excluded
- [cloud] Cloud-based sync backend, multi-user
- [ios] Apple Developer Program fee and iOS device registration - PHP ~5,500-6,000
- Hosting, Play Store publishing, and any third-party fees
- Maintenance post-deployment - 2 weeks allotted for bug-fixing

## Features (Functional Requirements)
- [offcut] List offcuts that are expiring or in poor condition
- [offcut] Add an offcut by material, length, width, thickness, quantity, condition, storage location, expiry date
- [offcut] Edit and delete/discard an offcut (soft delete so history is kept)
- [offcut] Search, sort, and filter offcuts by material, size, condition, status, "location"
- CSV import (?)

- form
    - material type - dropdown (2 types)
    - condition - dropdown
    - location - dropdown; storage bin
    - others - input data
- android, ios - can lean to PWA
- deployed, with database (construction site separated)
- image for material type/formworks (coco lumber, phenolic board)

user -> construction stie -> inventory (CRUD)
```

---

# 2026-10-19 (MAJOR UPDATE)

> [!IMPORTANT]
> NO MORE OFFCUTS, disregard everything above

> Check "Optimization Thesis" PDF, app design flow, and schematic diagram for prime context

structural members - the needed materials
materials - raw materials like plywood 
    - assume ALL is displayed as a rectangle (size depends on the dimensions)
formwork 
cutting optimization

inventory - store materials (with "usage" pointing to the visual cut)

create proj - passcode for specific proj (shown one-time)
- show optimized material usage with visuals (simple is enough)
- usage on materials - conditions can be updated by engineer 
    - if 5 usage - condition: "for inspection" 
