---
name: project-vibequeue-scaffold
description: VibeQueue monorepo scaffold state — workspaces, key dependency constraints, and environment facts
metadata:
  type: project
---

Monorepo scaffold (Ticket #1) is complete. The repo at `C:\Users\GergoSzucs\AI Practice\vide_queue_2` has:
- npm workspaces: `["backend", "frontend"]`
- Backend entry: `backend/src/index.js` (CommonJS, Express 4)
- Frontend: Vite 5 + React 18, Tailwind v4 via `@tailwindcss/vite`, plain JS (.jsx)
- `npm install` runs successfully from the root

Ticket #11 (frontend routing scaffold) is complete:
- `react-router-dom` installed in frontend workspace
- Routing: BrowserRouter + Routes in `App.jsx`; routes: `/`, `/auth/callback`, `/room/create`, `/room/:code`, `*`
- Contexts: `AuthContext.jsx` (useAuth, checkAuthStatus, fetch /api/auth/status), `RoomContext.jsx` (useRoom)
- Components: `Layout.jsx` (dark header + main), `LoadingSpinner.jsx`, `ErrorMessage.jsx`
- Pages: HomePage, CreateRoomPage, RoomPage (wraps RoomProvider), OAuthCallbackPage, NotFoundPage
- Vite build passes cleanly (49 modules, no errors)

**Why:** Node 24.15.0 is installed. `better-sqlite3` v9.x has no prebuilts for Node 24, causing node-gyp failures. v12.11.1 ships Node 24 prebuilts and installs cleanly.

**How to apply:** Always pin `better-sqlite3` to `^12.11.1` or later in this project. Do not downgrade to v9.x range.
