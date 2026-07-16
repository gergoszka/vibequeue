import { db } from '../db';
import { RoomRow, RoomMemberRow, UserRow, AppError } from '../types';
import { cleanupEmitter } from './cleanupService';

function generateCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/**
 * Create a new room for the given user, or return their existing active host room (idempotent).
 */
export function createRoom({
  userId,
  displayName,
  tokenAllowance = 5,
  tokenRefreshIntervalMinutes = 30,
  youtubeAccessToken = null,
}: {
  userId: string;
  displayName: string;
  tokenAllowance?: number;
  tokenRefreshIntervalMinutes?: number;
  youtubeAccessToken?: string | null;
}): { id: string; code: string; tokenAllowance: number; tokenRefreshIntervalMinutes: number } {
  const existing = db
    .prepare(
      `SELECT r.* FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id
       WHERE rm.user_id = ? AND rm.role = 'host' AND r.is_active = 1`
    )
    .get(userId) as RoomRow | undefined;

  if (existing) {
    if (youtubeAccessToken && youtubeAccessToken !== existing.youtube_access_token) {
      db.prepare('UPDATE rooms SET youtube_access_token = ? WHERE id = ?')
        .run(youtubeAccessToken, existing.id);
    }
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
    return {
      id: existing.id,
      code: existing.code,
      tokenAllowance: existing.token_allowance,
      tokenRefreshIntervalMinutes: existing.token_refresh_interval_minutes,
    };
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const insertRoom = db.prepare(`
    INSERT INTO rooms
      (id, code, youtube_access_token, token_allowance, token_refresh_interval_minutes, created_at, last_activity_at, is_active)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertMember = db.prepare(
    `INSERT INTO room_members (id, room_id, user_id, role, joined_at) VALUES (?, ?, ?, 'host', ?)`
  );

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      db.transaction(() => {
        insertRoom.run(id, code, youtubeAccessToken, tokenAllowance, tokenRefreshIntervalMinutes, now, now);
        insertMember.run(crypto.randomUUID(), id, userId, now);
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
      })();
      return { id, code, tokenAllowance, tokenRefreshIntervalMinutes };
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'string' &&
        (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to generate a unique room code after 5 attempts');
}

/**
 * Join a room as a guest, or return the existing member record (idempotent).
 *
 * @throws {AppError} 404 if room not found / inactive
 */
export function joinRoom({
  userId,
  code,
  displayName,
}: {
  userId: string;
  code: string;
  displayName: string;
}): { id: string; roomId: string; code: string; displayName: string; tokensRemaining: number; tokenRefreshIntervalMinutes: number } {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ? AND is_active = 1')
    .get(code) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  const existing = db
    .prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?')
    .get(room.id, userId) as RoomMemberRow | undefined;

  if (existing) {
    const user = db
      .prepare('SELECT display_name FROM users WHERE id = ?')
      .get(userId) as Pick<UserRow, 'display_name'> | undefined;
    return {
      id: existing.id,
      roomId: room.id,
      code: room.code,
      displayName: user?.display_name || displayName,
      tokensRemaining: existing.tokens_remaining ?? room.token_allowance,
      tokenRefreshIntervalMinutes: room.token_refresh_interval_minutes,
    };
  }

  const memberId = crypto.randomUUID();
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO room_members (id, room_id, user_id, role, tokens_remaining, last_token_refresh_at, joined_at)
       VALUES (?, ?, ?, 'guest', ?, ?, ?)`
    ).run(memberId, room.id, userId, room.token_allowance, now, now);

    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
  })();

  return {
    id: memberId,
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
  return row ?? null;
}

/**
 * Hard-delete a room and all its data. Throws 404/403 if not found or user is not the host.
 */
export function endRoom(code: string, userId: string): void {
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  const isHost = db
    .prepare(`SELECT id FROM room_members WHERE room_id = ? AND user_id = ? AND role = 'host'`)
    .get(room.id, userId);

  if (!isHost) {
    throw new AppError('Forbidden', 403);
  }

  db.transaction(() => {
    db.prepare('DELETE FROM queue_entries WHERE room_id = ?').run(room.id);
    db.prepare('DELETE FROM room_members WHERE room_id = ?').run(room.id);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
  })();

  cleanupEmitter.emit('room_closed', room.code);
}

/**
 * Returns true when userId is the host of roomId.
 */
export function isCreator(roomId: string, userId: string): boolean {
  return !!db
    .prepare(`SELECT id FROM room_members WHERE room_id = ? AND user_id = ? AND role = 'host'`)
    .get(roomId, userId);
}
