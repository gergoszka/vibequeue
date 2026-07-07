-- VibeQueue SQLite Schema
-- This file is for documentation/reference only.
-- The schema is applied at runtime by backend/src/db/index.js.

PRAGMA foreign_keys = ON;

-- rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,                          -- UUID
  code TEXT UNIQUE NOT NULL,                    -- 5-char alphanumeric, uppercase
  creator_session_id TEXT NOT NULL,
  youtube_access_token TEXT,
  youtube_refresh_token TEXT,
  token_expires_at INTEGER,                     -- Unix timestamp (ms)
  token_allowance INTEGER NOT NULL DEFAULT 5,
  token_refresh_interval_minutes INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL,                  -- Unix timestamp (ms)
  last_activity_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  is_active INTEGER NOT NULL DEFAULT 1          -- SQLite boolean (0/1)
);

-- guests table
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,                          -- UUID
  room_id TEXT NOT NULL REFERENCES rooms(id),
  session_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  tokens_remaining INTEGER NOT NULL,
  last_token_refresh_at INTEGER NOT NULL,       -- Unix timestamp (ms)
  joined_at INTEGER NOT NULL                    -- Unix timestamp (ms)
);

-- queue_entries table
CREATE TABLE IF NOT EXISTS queue_entries (
  id TEXT PRIMARY KEY,                          -- UUID
  room_id TEXT NOT NULL REFERENCES rooms(id),
  added_by_session_id TEXT NOT NULL,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',       -- 'pending' | 'playing' | 'played' | 'removed'
  added_at INTEGER NOT NULL                     -- Unix timestamp (ms)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_guests_session_id ON guests(session_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_room_position ON queue_entries(room_id, position);
