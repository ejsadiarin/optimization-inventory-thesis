# React + Vite + Dexie.js PWA stack

> **Update (2026-10-24):** The Dexie data layer is superseded by ADR-0006 (Firestore + Auth cloud sync). The React + Vite + PWA decision stands; only the client-only IndexedDB storage changed.

The thesis requires a Progressive Web App that works offline across all devices. We chose React (Vite bundler) with Dexie.js (IndexedDB wrapper) over alternatives like SvelteKit, Flutter Web, or a native mobile app. React has the widest ecosystem for the thesis clients (civil engineering students) to find support, Vite gives fast dev iteration, and Dexie.js provides a clean offline-first data layer without needing a backend or SQLite WASM. The scope explicitly excludes cloud sync and multi-user, so a client-side-only architecture with IndexedDB is sufficient.

## Considered Options

- **SvelteKit + IndexedDB**: lighter runtime, but smaller ecosystem and harder for the thesis team to find help extending or maintaining.
- **Next.js + wa-sqlite (WASM)**: gives real SQL queries offline but adds significant bundle size and complexity for marginal benefit in a prototype.
- **React Native / Flutter**: the thesis scope changed from native to PWA; a native app would require App Store deployment (excluded from scope).
