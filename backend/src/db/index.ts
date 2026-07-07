import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists before opening the DB file
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'vibequeue.db');
export const db = new Database(dbPath);

// Enable foreign key enforcement (must be set per connection)
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    creator_session_id TEXT NOT NULL,
    youtube_access_token TEXT,
    youtube_refresh_token TEXT,
    token_expires_at INTEGER,
    token_allowance INTEGER NOT NULL DEFAULT 5,
    token_refresh_interval_minutes INTEGER NOT NULL DEFAULT 30,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    session_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    tokens_remaining INTEGER NOT NULL,
    last_token_refresh_at INTEGER NOT NULL,
    joined_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queue_entries (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    added_by_session_id TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    added_at INTEGER NOT NULL
  );
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
  CREATE INDEX IF NOT EXISTS idx_guests_session_id ON guests(session_id);
  CREATE INDEX IF NOT EXISTS idx_queue_entries_room_position ON queue_entries(room_id, position);
`);

// Migrations for columns added after initial schema
try {
  db.exec('ALTER TABLE queue_entries ADD COLUMN started_playing_at INTEGER');
} catch { /* already exists */ }
try {
  db.exec("ALTER TABLE queue_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'user'");
} catch { /* already exists */ }
try {
  db.exec('ALTER TABLE rooms ADD COLUMN playlist_id TEXT');
} catch { /* already exists */ }
try {
  db.exec('ALTER TABLE rooms ADD COLUMN playlist_next_page_token TEXT');
} catch { /* already exists */ }

// Migration: remove the session_id UNIQUE constraint from guests so a session
// can join more than one room over time (e.g. after the host creates a new room).
// SQLite cannot drop constraints via ALTER TABLE, so we recreate the table.
{
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='guests'")
    .get() as { sql: string } | undefined;
  if (row?.sql?.includes('session_id TEXT UNIQUE')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE guests_new (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        session_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        tokens_remaining INTEGER NOT NULL,
        last_token_refresh_at INTEGER NOT NULL,
        joined_at INTEGER NOT NULL
      );
      INSERT INTO guests_new SELECT * FROM guests;
      DROP TABLE guests;
      ALTER TABLE guests_new RENAME TO guests;
      COMMIT;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_guests_room_session ON guests(room_id, session_id)');
    db.pragma('foreign_keys = ON');
  }
}

console.log('Database initialized');
