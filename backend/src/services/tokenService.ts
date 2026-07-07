import EventEmitter from 'events';
import { db } from '../db';
import { GuestRow, RoomRow } from '../types';

export const tokenEmitter = new EventEmitter();

// Module-level map from roomId → intervalId for the token refresh scheduler
const schedulers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Atomically deduct 1 token from a guest.
 * Throws Error('Insufficient tokens') if tokens_remaining is 0.
 * Returns the new tokens_remaining count.
 */
export function deductToken(guestId: string): number {
  const deduct = db.transaction((): number => {
    const guest = db
      .prepare('SELECT tokens_remaining FROM guests WHERE id = ?')
      .get(guestId) as Pick<GuestRow, 'tokens_remaining'> | undefined;

    if (!guest) {
      throw new Error('Guest not found');
    }

    if (guest.tokens_remaining <= 0) {
      throw new Error('Insufficient tokens');
    }

    db.prepare(
      'UPDATE guests SET tokens_remaining = tokens_remaining - 1 WHERE id = ?'
    ).run(guestId);

    return guest.tokens_remaining - 1;
  });

  return deduct();
}

/**
 * For all guests in a room: if now - last_token_refresh_at >= interval_ms,
 * increment tokens_remaining by 1 (capped at room's token_allowance).
 * Updates last_token_refresh_at to now for each refreshed guest.
 * All updates are batched in a single transaction for atomicity.
 */
export function refreshTokens(roomId: string): void {
  const refresh = db.transaction((): void => {
    const room = db
      .prepare(
        'SELECT token_allowance, token_refresh_interval_minutes FROM rooms WHERE id = ?'
      )
      .get(roomId) as Pick<RoomRow, 'token_allowance' | 'token_refresh_interval_minutes'> | undefined;

    if (!room) {
      return;
    }

    const intervalMs = room.token_refresh_interval_minutes * 60 * 1000;
    const now = Date.now();

    const guests = db
      .prepare('SELECT id, tokens_remaining, last_token_refresh_at FROM guests WHERE room_id = ?')
      .all(roomId) as Pick<GuestRow, 'id' | 'tokens_remaining' | 'last_token_refresh_at'>[];

    const updateGuest = db.prepare(
      'UPDATE guests SET tokens_remaining = ?, last_token_refresh_at = ? WHERE id = ?'
    );

    for (const guest of guests) {
      if (now - guest.last_token_refresh_at >= intervalMs) {
        const newTokens = Math.min(
          guest.tokens_remaining + 1,
          room.token_allowance
        );
        updateGuest.run(newTokens, now, guest.id);
      }
    }
  });

  refresh();
}

/**
 * Returns token status for a guest in the context of their room.
 */
export function getTokenStatus(
  guestId: string,
  roomId: string
): { tokensRemaining: number; secondsUntilNextToken: number } {
  const room = db
    .prepare('SELECT token_refresh_interval_minutes FROM rooms WHERE id = ?')
    .get(roomId) as Pick<RoomRow, 'token_refresh_interval_minutes'> | undefined;

  if (!room) {
    throw new Error('Room not found');
  }

  const guest = db
    .prepare('SELECT tokens_remaining, last_token_refresh_at FROM guests WHERE id = ?')
    .get(guestId) as Pick<GuestRow, 'tokens_remaining' | 'last_token_refresh_at'> | undefined;

  if (!guest) {
    throw new Error('Guest not found');
  }

  const intervalMs = room.token_refresh_interval_minutes * 60 * 1000;
  const secondsUntilNextToken = Math.max(
    0,
    (guest.last_token_refresh_at + intervalMs - Date.now()) / 1000
  );

  return {
    tokensRemaining: guest.tokens_remaining,
    secondsUntilNextToken,
  };
}

/**
 * Start a 60-second interval for a room that calls refreshTokens(roomId).
 * Emits 'tokens_refreshed' with roomCode after each check so the WS layer
 * can push a token_refreshed event to connected guests.
 */
export function startTokenScheduler(roomId: string, roomCode: string): void {
  const existing = schedulers.get(roomId);
  if (existing !== undefined) {
    clearInterval(existing);
  }

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
  if (intervalId !== undefined) {
    clearInterval(intervalId);
  }
  schedulers.delete(roomId);
}
