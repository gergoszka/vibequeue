import EventEmitter from 'events';
import { db } from '../db';
import { RoomMemberRow, RoomRow } from '../types';

export const tokenEmitter = new EventEmitter();

const schedulers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Atomically deduct 1 token from a room member.
 * Throws 'Insufficient tokens' if tokens_remaining is 0.
 * Returns the new tokens_remaining count.
 */
export function deductToken(memberId: string): number {
  const deduct = db.transaction((): number => {
    const member = db
      .prepare('SELECT tokens_remaining FROM room_members WHERE id = ?')
      .get(memberId) as Pick<RoomMemberRow, 'tokens_remaining'> | undefined;

    if (!member) throw new Error('Member not found');
    if ((member.tokens_remaining ?? 0) <= 0) throw new Error('Insufficient tokens');

    db.prepare(
      'UPDATE room_members SET tokens_remaining = tokens_remaining - 1 WHERE id = ?'
    ).run(memberId);

    return (member.tokens_remaining ?? 1) - 1;
  });

  return deduct();
}

/**
 * For all guest members in a room: if now - last_token_refresh_at >= interval_ms,
 * increment tokens_remaining by 1 (capped at room's token_allowance).
 */
export function refreshTokens(roomId: string): void {
  const refresh = db.transaction((): void => {
    const room = db
      .prepare('SELECT token_allowance, token_refresh_interval_minutes FROM rooms WHERE id = ?')
      .get(roomId) as Pick<RoomRow, 'token_allowance' | 'token_refresh_interval_minutes'> | undefined;

    if (!room) return;

    const intervalMs = room.token_refresh_interval_minutes * 60 * 1000;
    const now = Date.now();

    const members = db
      .prepare(
        `SELECT id, tokens_remaining, last_token_refresh_at FROM room_members
         WHERE room_id = ? AND role = 'guest'`
      )
      .all(roomId) as Pick<RoomMemberRow, 'id' | 'tokens_remaining' | 'last_token_refresh_at'>[];

    const update = db.prepare(
      'UPDATE room_members SET tokens_remaining = ?, last_token_refresh_at = ? WHERE id = ?'
    );

    for (const member of members) {
      if (now - (member.last_token_refresh_at ?? 0) >= intervalMs) {
        const newTokens = Math.min((member.tokens_remaining ?? 0) + 1, room.token_allowance);
        update.run(newTokens, now, member.id);
      }
    }
  });

  refresh();
}

/**
 * Returns token status for a room member.
 */
export function getTokenStatus(
  memberId: string,
  roomId: string
): { tokensRemaining: number; secondsUntilNextToken: number } {
  const room = db
    .prepare('SELECT token_refresh_interval_minutes FROM rooms WHERE id = ?')
    .get(roomId) as Pick<RoomRow, 'token_refresh_interval_minutes'> | undefined;

  if (!room) throw new Error('Room not found');

  const member = db
    .prepare('SELECT tokens_remaining, last_token_refresh_at FROM room_members WHERE id = ?')
    .get(memberId) as Pick<RoomMemberRow, 'tokens_remaining' | 'last_token_refresh_at'> | undefined;

  if (!member) throw new Error('Member not found');

  const intervalMs = room.token_refresh_interval_minutes * 60 * 1000;
  const secondsUntilNextToken = Math.max(
    0,
    ((member.last_token_refresh_at ?? 0) + intervalMs - Date.now()) / 1000
  );

  return {
    tokensRemaining: member.tokens_remaining ?? 0,
    secondsUntilNextToken,
  };
}

/**
 * Start a 60-second interval that calls refreshTokens and emits 'tokens_refreshed'.
 */
export function startTokenScheduler(roomId: string, roomCode: string): void {
  const existing = schedulers.get(roomId);
  if (existing !== undefined) clearInterval(existing);

  const intervalId = setInterval(() => {
    refreshTokens(roomId);
    tokenEmitter.emit('tokens_refreshed', roomCode);
  }, 60_000);
  schedulers.set(roomId, intervalId);
}

/**
 * Clear the token refresh interval for a room.
 */
export function stopTokenScheduler(roomId: string): void {
  const intervalId = schedulers.get(roomId);
  if (intervalId !== undefined) clearInterval(intervalId);
  schedulers.delete(roomId);
}
