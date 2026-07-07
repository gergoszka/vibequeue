import { db } from '../db';
import { RoomRow, GuestRow, AppError } from '../types';

/**
 * Generate a 5-char uppercase alphanumeric room code.
 */
function generateCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/**
 * Create a new room for the given session, or return the existing active room
 * if one already exists for this session (idempotent).
 */
export function createRoom({
  sessionId,
  tokenAllowance = 5,
  tokenRefreshIntervalMinutes = 30,
  youtubeAccessToken = null,
}: {
  sessionId: string;
  tokenAllowance?: number;
  tokenRefreshIntervalMinutes?: number;
  youtubeAccessToken?: string | null;
}): { id: string; code: string; tokenAllowance: number; tokenRefreshIntervalMinutes: number } {
  // Idempotency: return existing active room for this session
  const existing = db
    .prepare('SELECT * FROM rooms WHERE creator_session_id = ? AND is_active = 1')
    .get(sessionId) as RoomRow | undefined;

  if (existing) {
    if (youtubeAccessToken && youtubeAccessToken !== existing.youtube_access_token) {
      db.prepare('UPDATE rooms SET youtube_access_token = ? WHERE id = ?')
        .run(youtubeAccessToken, existing.id);
    }
    return {
      id: existing.id,
      code: existing.code,
      tokenAllowance: existing.token_allowance,
      tokenRefreshIntervalMinutes: existing.token_refresh_interval_minutes,
    };
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const insert = db.prepare(`
    INSERT INTO rooms
      (id, code, creator_session_id, youtube_access_token, token_allowance, token_refresh_interval_minutes, created_at, last_activity_at, is_active)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  // Retry loop — up to 5 attempts on UNIQUE constraint collision for code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      insert.run(id, code, sessionId, youtubeAccessToken, tokenAllowance, tokenRefreshIntervalMinutes, now, now);
      return { id, code, tokenAllowance, tokenRefreshIntervalMinutes };
    } catch (err: unknown) {
      // SQLite UNIQUE constraint error: better-sqlite3 uses err.code === 'SQLITE_CONSTRAINT_UNIQUE'
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'string' &&
        (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
      ) {
        // collision — retry with a new code
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to generate a unique room code after 5 attempts');
}

/**
 * Join a room, or return the existing guest record if this session already joined (idempotent).
 *
 * @throws {AppError} with status 404 if room not found / inactive
 */
export function joinRoom({
  sessionId,
  code,
  displayName,
}: {
  sessionId: string;
  code: string;
  displayName: string;
}): { id: string; roomId: string; code: string; displayName: string; tokensRemaining: number; tokenRefreshIntervalMinutes: number } {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ? AND is_active = 1')
    .get(code) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  // Idempotency: return existing guest record for this session in this room.
  const existing = db
    .prepare('SELECT * FROM guests WHERE room_id = ? AND session_id = ?')
    .get(room.id, sessionId) as GuestRow | undefined;

  if (existing) {
    return {
      id: existing.id,
      roomId: room.id,
      code: room.code,
      displayName: existing.display_name,
      tokensRemaining: existing.tokens_remaining,
      tokenRefreshIntervalMinutes: room.token_refresh_interval_minutes,
    };
  }

  const guestId = crypto.randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO guests
      (id, room_id, session_id, display_name, tokens_remaining, last_token_refresh_at, joined_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `).run(guestId, room.id, sessionId, displayName, room.token_allowance, now, now);

  return {
    id: guestId,
    roomId: room.id,
    code: room.code,
    displayName,
    tokensRemaining: room.token_allowance,
    tokenRefreshIntervalMinutes: room.token_refresh_interval_minutes,
  };
}

/**
 * Fetch a room by code.
 */
export function getRoom(code: string): RoomRow | null {
  const row = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;
  if (!row) return null;
  return row;
}

/**
 * Deactivate a room. Throws AppError if sessionId is not the creator.
 *
 * @throws {AppError} with status 404 or 403
 */
export function endRoom(code: string, sessionId: string): void {
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  if (room.creator_session_id !== sessionId) {
    throw new AppError('Forbidden', 403);
  }

  db.prepare('UPDATE rooms SET is_active = 0 WHERE id = ?').run(room.id);
}

/**
 * Check whether a session is the creator of the given room row.
 */
export function isCreator(room: RoomRow, sessionId: string): boolean {
  return room.creator_session_id === sessionId;
}
