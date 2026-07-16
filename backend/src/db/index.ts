import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists before opening the DB file
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'vibequeue.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// ─── Schema migration: guests/creator_session_id → users/room_members ────────
// Detect whether the old schema is in place by checking for creator_session_id
// on the rooms table. If found, wipe all transient data and recreate the tables.
{
  const roomsDef = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='rooms'")
    .get() as { sql: string } | undefined;

  if (roomsDef?.sql?.includes('creator_session_id')) {
    console.log('[db] Migrating schema to users/room_members — clearing transient data...');
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN;
      DELETE FROM queue_entries;
      DROP TABLE IF EXISTS guests;
      DROP TABLE IF EXISTS user_refresh_tokens;

      CREATE TABLE rooms_new (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        youtube_access_token TEXT,
        token_allowance INTEGER NOT NULL DEFAULT 5,
        token_refresh_interval_minutes INTEGER NOT NULL DEFAULT 30,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        playlist_id TEXT,
        playlist_next_page_token TEXT
      );
      INSERT INTO rooms_new
        SELECT id, code, youtube_access_token, token_allowance,
               token_refresh_interval_minutes, created_at, last_activity_at,
               is_active, playlist_id, playlist_next_page_token
        FROM rooms;
      DROP TABLE rooms;
      ALTER TABLE rooms_new RENAME TO rooms;

      CREATE TABLE queue_entries_new (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        added_by_user_id TEXT NOT NULL,
        youtube_video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        thumbnail_url TEXT,
        duration_seconds INTEGER,
        position INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'user',
        added_at INTEGER NOT NULL,
        started_playing_at INTEGER
      );
      DROP TABLE queue_entries;
      ALTER TABLE queue_entries_new RENAME TO queue_entries;
      COMMIT;
    `);
    db.pragma('foreign_keys = ON');
    console.log('[db] Schema migrated to users/room_members — all room data cleared');
  }
}

// ─── Baseline tables (idempotent) ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    session_id TEXT,
    refresh_token TEXT,
    refresh_token_updated_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    youtube_access_token TEXT,
    token_allowance INTEGER NOT NULL DEFAULT 5,
    token_refresh_interval_minutes INTEGER NOT NULL DEFAULT 30,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    playlist_id TEXT,
    playlist_next_page_token TEXT
  );

  CREATE TABLE IF NOT EXISTS room_members (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('host','guest')),
    tokens_remaining INTEGER,
    last_token_refresh_at INTEGER,
    joined_at INTEGER NOT NULL,
    UNIQUE(room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS queue_entries (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    added_by_user_id TEXT NOT NULL REFERENCES users(id),
    youtube_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'user',
    added_at INTEGER NOT NULL,
    started_playing_at INTEGER
  );
`);

// ─── Indexes ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
  CREATE INDEX IF NOT EXISTS idx_room_members_room_user ON room_members(room_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_queue_entries_room_position ON queue_entries(room_id, position);
`);

console.log('Database initialized');
