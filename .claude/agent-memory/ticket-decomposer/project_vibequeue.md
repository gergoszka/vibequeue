---
name: project-vibequeue
description: VibeQueue project — party music queue app with YouTube OAuth, token-based guest allowances, and WebSocket sync
metadata:
  type: project
---

VibeQueue is a web app (React/Vite frontend + Node.js/Express backend) where a creator opens a room, guests join by 5-char code, and everyone contributes to a shared YouTube music queue using a token allowance system.

**Why:** Prevent song-selection disputes at parties by giving each guest a limited, auto-refreshing token budget for adding songs.

**How to apply:** All tickets target this fresh project at `C:\Users\GergoSzucs\AI Practice\vide_queue_2`. No existing code — everything is built from scratch.

Key architectural decisions captured in tickets:
- Auth: YouTube OAuth 2.0 PKCE flow (frontend-initiated). Creator only needs YouTube Music. Guests have no auth.
- Playback: YouTube IFrame Player API embedded in creator's browser tab — no server-side playback.
- Real-time: WebSocket (ws library) primary; polling fallback after 5 failed reconnects.
- DB: better-sqlite3 (SQLite) for dev. Schema: rooms, guests, queue_entries.
- Token engine: per-guest, individually timed refresh. DB transaction for deduction to prevent double-spend.
- Room lifecycle: 1-hour inactivity timeout (no playing song + last_activity_at > 1hr ago).

24 tickets created across 7 phases:
- Phase 1 (Foundation): #1 scaffold, #2 DB schema, #3 Express middleware
- Phase 2 (Core Backend): #4 room CRUD, #5 token engine, #6 queue API, #7 cleanup service
- Phase 3 (YouTube): #8 OAuth backend, #9 search proxy, #10 IFrame player
- Phase 4 (Frontend Core): #11 routing scaffold, #12 creator OAuth flow, #14 guest join flow, #15 queue display, #16 search UI
- Phase 5 (Real-time): #13 WS server, #17 WS client hook
- Phase 6 (Polish): #18 token counter UI, #19 mobile responsive, #20 creator controls
- Phase 7 (Hardening): #21 validation, #22 error boundaries, #23 edge cases, #24 smoke test

**How to apply:** When implementing tickets, respect the dependency DAG. Phase 1 must be complete before Phase 2 starts. Tickets within a phase can sometimes be parallelized if deps are met.

Assumption flagged for review: Creator can only have one active room at a time (MVP constraint).
Assumption flagged for review: Duplicate video IDs allowed in queue (same song can be queued twice).
Fundamental constraint: Music stops if creator closes their browser tab (IFrame player is client-side only).
