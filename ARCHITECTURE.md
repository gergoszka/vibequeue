# VibeQueue — Architecture & Design Decisions

## What It Is

VibeQueue is a collaborative music-queuing app. One person (the **host**) connects their YouTube account, creates a room, and their browser plays the music. Anyone else can join as a **guest** by navigating to the room URL, and add songs to the shared queue by spending tokens. The host's browser is the only speaker in the room.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | Node.js + Express + TypeScript | Familiar, lightweight, sufficient for this scale |
| Database | SQLite via `better-sqlite3` | Zero-ops, synchronous API eliminates async bugs, file-based persistence |
| Sessions | `express-session` + `connect-sqlite3` | Cookie-based auth without JWTs; session data persists across restarts |
| Real-time | `ws` (WebSocket) | Low-overhead push for queue updates; no polling needed |
| Frontend | React 18 + Vite + TypeScript | Fast dev server, strict types, component model |
| Styling | Tailwind CSS | Utility-first, no CSS files to maintain |
| Auth | Google OAuth 2.0 | Required to call the YouTube Data API |
| Music | YouTube IFrame API | Free, huge catalogue, no hosting cost |

---

## High-Level Architecture

```
Browser (Host)                  Browser (Guest)
     │                               │
     │  HTTP + WebSocket             │  HTTP + WebSocket
     ▼                               ▼
┌─────────────────────────────────────────┐
│              Express Server             │
│                                         │
│  Routes → Services → SQLite DB          │
│                ↕                        │
│           ws/wsServer                   │
│   (broadcasts queue/token events)       │
└─────────────────────────────────────────┘
           │
           │  YouTube Data API v3
           ▼
      Google servers
```

The server is stateless except for the SQLite database and in-memory WebSocket client sets (rebuilt on reconnect). All persistent state lives in the DB.

---

## Authentication

### Why Google OAuth instead of passwords

The YouTube Data API requires an OAuth access token to make search requests on behalf of a user. There is no option to use an API key for user-authenticated endpoints. So OAuth is mandatory for search, and it doubles as the host's login.

### The OAuth flow

1. Frontend fetches a consent URL from `GET /api/auth/youtube/url`
2. User is redirected to Google's consent screen
3. Google redirects back to `/auth/callback?code=...`
4. Frontend POSTs the code to `POST /api/auth/youtube/callback`
5. Backend exchanges the code for `access_token` + `refresh_token` via Google's token endpoint
6. Tokens are stored in the **server-side session**, not in the browser

### Why tokens are in the session, not the browser

Keeping OAuth tokens server-side means:
- They are never exposed to JavaScript (XSS-safe)
- The browser only holds a `connect.sid` cookie (httpOnly)
- Revocation is immediate — destroy the session row

### Token refresh

Every call to `GET /api/auth/status` (which runs on every page load) checks if the access token is within 5 minutes of expiry. If so, it silently exchanges the refresh token for a new access token and saves it back to the session. The user never sees a re-auth prompt as long as they have a valid refresh token.

### Session lifetime

Sessions last **1 day**, rolling — meaning each request resets the expiry clock. Active users stay logged in indefinitely. Inactive sessions expire naturally. On logout, the session is destroyed server-side and the cookie is cleared.

### Guest authentication

Guests also go through Google OAuth. This is required because:
- Search calls the YouTube Data API, which requires an access token
- Without their own token, guests would share the host's token quota
- Google enforces per-user rate limits, so separate tokens avoid contention

When a guest visits a room URL without being signed in, they see a **"Sign in with YouTube"** prompt. The OAuth `state` parameter carries `{ intent: "guest", roomCode: "XXXXX" }` so that after the OAuth callback the user is returned to the correct room, not the create-room page.

A guest who is already signed in skips the OAuth step entirely and goes straight to the display name form.

---

## Rooms

### Room codes

Rooms are identified by a **5-character uppercase alphanumeric code** (e.g. `AB3XY`). These are short enough to share verbally or via a link. On collision (unlikely but possible), the server retries up to 5 times with a new random code.

### Room ownership

The room is tied to the **Express session ID** of the host, not a user account. This means:
- No account system needed
- The host's room disappears if their session expires
- There is no "transfer host" feature

### Idempotent creation

`POST /api/rooms` checks if the session already has an active room and returns it instead of creating a new one. This prevents accidental duplicate rooms on form resubmission or page refresh.

### Inactivity cleanup

A background watcher runs every 5 minutes and closes rooms that have been inactive for over 1 hour **and** have nothing currently playing. The "currently playing" guard prevents a long song from triggering cleanup mid-play. When a room closes, a `room_closed` WebSocket event is broadcast and all guests are redirected to the home page.

Hosts send a **heartbeat** (`POST /api/rooms/:code/heartbeat`) every 2 minutes from the browser to keep `last_activity_at` fresh.

---

## Queue

### Statuses

Each queue entry has a status that follows a one-way path:

```
pending → playing → played
       → removed  (can be removed from any non-played state)
```

There is always at most one `playing` entry per room. When the playing entry ends or is skipped, `advanceQueue` atomically marks it `played` and promotes the next `pending` entry.

### Auto-start

When the first song is added to an empty room (no `playing` entry exists), `addToQueue` sets the new entry directly to `playing` rather than `pending`. This means music starts immediately without needing the host to press play.

### Position numbers

Positions are monotonically increasing integers, never re-used. This means the position column reflects the historical order in which songs were added, not the current position in the visible queue. In the UI, the Up Next list displays 1, 2, 3... based on array index, not the raw DB position value.

### Transactions

All queue mutations use `better-sqlite3` transactions. This prevents a race condition where two concurrent requests could both see "no playing entry" and both try to set their song as `playing`.

---

## Token Economy

### Why tokens exist

Without a cost to adding songs, a single guest could fill the queue with hundreds of tracks. Tokens rate-limit additions without blocking guests entirely.

### How tokens work

- Each guest starts with `token_allowance` tokens (configurable by the host at room creation, 1–20, default 5)
- Adding a song costs 1 token
- Tokens replenish by +1 per `token_refresh_interval_minutes` (15, 30, or 60 minutes, default 30), capped at `token_allowance`

### The scheduler

When a room is created, a server-side `setInterval` fires every 60 seconds for that room. On each tick it checks all guests: any guest whose `last_token_refresh_at` is older than the refresh interval gets +1 token and an updated timestamp. After each tick, a `token_refreshed` WebSocket event is broadcast to the room so clients update instantly.

On server restart, the scheduler is restarted for all active rooms by querying `rooms WHERE is_active = 1` during startup.

### Why time-based instead of song-based

A time-based system is simpler and fairer: guests earn tokens regardless of whether the host plays their songs quickly. A song-based system would require tracking per-guest song completions, which adds complexity without a clear fairness advantage.

### Frontend token display

`useTokenStatus` polls `GET /api/rooms/:code/token-status` and runs a client-side 1-second countdown. When the countdown hits zero it re-fetches to pick up the server-granted token. The WS `token_refreshed` event also triggers a refetch for instant feedback. The token count feeds into `SearchPanel` to disable the Add button when a guest has no tokens. Both the display (`TokenStatus` component) and the button gating use the same live data from `RoomContext` to avoid stale state.

---

## Real-Time Updates (WebSocket)

### Architecture

The `ws` WebSocket server is attached to the same HTTP server. Clients connect, then send a `join_room` message with the room code. The server maintains a `Map<roomCode, Set<WebSocket>>` of active connections. A 30-second ping/pong heartbeat terminates dead connections.

### Events

| Event | Direction | Trigger |
|---|---|---|
| `queue_updated` | Server → clients | Any queue mutation |
| `now_playing` | Server → clients | A new song starts playing |
| `room_closed` | Server → clients | Inactivity watcher closes the room |
| `token_refreshed` | Server → clients | Token scheduler tick |

Queue events are emitted from `queueService` via a Node.js `EventEmitter` (`queueEmitter`). The WS server subscribes to these emitters and translates them into WebSocket broadcasts. This decouples the queue logic from the transport layer.

### Fallback polling

If the WebSocket connection fails after 5 retries, the frontend falls back to polling `GET /api/rooms/:code/queue` every 10 seconds. This covers network environments that block WebSocket upgrades.

---

## Music Playback

### Why background audio, not a visible player

The host controls the queue; guests should see who's playing and what's next, not video thumbnails or player chrome. Hiding the video keeps the UI focused on the social queue experience.

### How it works

The YouTube IFrame API requires a DOM element to mount into. The element is placed off-screen (`position: absolute; left: -9999px; width: 1px; height: 1px`) so it exists in the DOM (required by the API) but is invisible. Audio plays normally; video frames are rendered but clipped.

### Autoplay muting

Browsers block autoplay of unmuted media. The player starts **muted** (`mute: 1` in player vars). A **"Enable audio"** button appears in the Now Playing card for the host. Once clicked, the player is unmuted and the preference is remembered for subsequent songs (`loadVideoById` can reset mute state, so the hook re-applies unmute on each video swap).

### Player lifecycle

The `useYoutubePlayer` hook loads the IFrame API script once globally (guarded by a module-level flag). The player instance is created once and reused; video swaps call `loadVideoById` rather than destroying and recreating the player. This avoids re-initialization overhead and the re-muting that would come with a fresh player.

### Song advancement

When the YouTube player fires `onStateChange` with `ENDED`, `handleEnded` calls `POST /api/rooms/:code/queue/advance`. The server marks the current entry `played`, promotes the next `pending` entry to `playing`, and broadcasts `queue_updated` + `now_playing` to all clients. Guests see the queue update in real time.

Player errors (unplayable videos, region-blocked content) are handled by skipping to the next song automatically, with a brief "Skipping unavailable video…" message shown to the host.

---

## Shared State (React Context)

### RoomContext

`RoomProvider` is the single source of truth for everything room-related:
- Room metadata (`code`, `tokenAllowance`, etc.)
- Whether the current user is the creator
- The guest record (if joined)
- Queue state (via `useQueue`) — entries, nowPlaying, upcomingEntries
- Token status (via `useTokenStatus`) — live count, countdown, refresh callback

Lifting `useQueue` and `useTokenStatus` into the context rather than calling them in individual components prevents each component from maintaining its own polling interval and ensures that a WebSocket event triggers exactly one refetch that updates all components simultaneously.

### Why not Redux / Zustand

The app has one active "room" at a time and the state tree is shallow. A single context with a few `useState` calls is easier to reason about than a separate state management library for this scale.

---

## Search

### Music-only filter

The YouTube search uses `videoCategoryId: '10'` (Music) and `type: 'video'` to filter out non-music content. Live streams are additionally filtered out by the `liveBroadcastContent` field in the search response and by duration (`P0D` signals a live stream in the video details response).

### Two-request enrichment

The YouTube search API (`/search`) does not return video duration. A second call to `/videos` with `part=contentDetails` fetches duration for all result IDs in a single batch request. The two responses are merged before returning results to the frontend.

### Token (guest search)

Guests search using their own OAuth token from the session. If a guest's session has no token (e.g. they joined before the mandatory-auth feature was added), the room's stored creator token is used as a fallback. The creator always uses their own live session token.

---

## Database Migration Strategy

The schema is applied using `CREATE TABLE IF NOT EXISTS` on every server start — safe and idempotent. New columns added after the initial schema use `ALTER TABLE ADD COLUMN` wrapped in a try/catch, since SQLite ignores the error if the column already exists. This avoids a formal migration system for a project at this scale.

---

## Security Decisions

| Decision | Reason |
|---|---|
| OAuth tokens stored server-side in session | Never exposed to JavaScript; protected from XSS |
| `httpOnly` session cookie | JavaScript cannot read or steal the session cookie |
| `sameSite: lax` | Prevents CSRF on cross-site form submissions while allowing GET navigations |
| Input validation middleware | Centralized `validate()` factory rejects malformed payloads before they reach services |
| Creator-only `advanceQueue` | Prevents guests from skipping songs the host wants to play |
| Soft-delete for queue entries | `status = 'removed'` preserves history; avoids gaps in position ordering |

---

## Known Limitations

- **Single host per room.** There is no co-host or transfer feature.
- **No pause.** The YouTube IFrame API can be paused programmatically but the UI offers no pause button — only Skip.
- **Host tab must stay open.** Music stops if the host closes the tab. There is a beforeunload warning but it can be dismissed.
- **No persistence across host disconnects.** If the host's browser loses its session, they cannot reclaim the same room.
- **Token scheduler granularity.** The scheduler checks every 60 seconds, so token grants can be up to 60 seconds late relative to the configured interval.
- **YouTube API quota.** Each search costs approximately 100 units from the day's 10,000-unit quota. Heavy usage will hit this limit.
