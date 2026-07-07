import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { getTokenStatus, refreshTokens } from '../services/tokenService';
import type { RoomRow, GuestRow } from '../types';

/**
 * GET /api/rooms/:code/token-status
 *
 * Responses:
 *  - 200 { tokensRemaining: null, isCreator: true }           — requester is the room creator
 *  - 200 { tokensRemaining: number, secondsUntilNextToken: number, isCreator: false } — known guest
 *  - 404 { error: 'Room not found' }                          — no room with that code
 *  - 404 { error: 'Not a member of this room' }               — not creator and not a guest
 */
export async function tokenStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code } = req.params;
    const sessionId = req.session.id;

    // Look up the room by its short code
    const room = db
      .prepare(
        'SELECT id, creator_session_id FROM rooms WHERE code = ? AND is_active = 1'
      )
      .get(code) as Pick<RoomRow, 'id' | 'creator_session_id'> | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Creator check — creators do not consume tokens
    if (sessionId === room.creator_session_id) {
      res.json({ tokensRemaining: null, isCreator: true });
      return;
    }

    // Guest check
    const guest = db
      .prepare('SELECT id FROM guests WHERE room_id = ? AND session_id = ?')
      .get(room.id, sessionId) as Pick<GuestRow, 'id'> | undefined;

    if (!guest) {
      res.status(404).json({ error: 'Not a member of this room' });
      return;
    }

    refreshTokens(room.id);
    const { tokensRemaining, secondsUntilNextToken } = getTokenStatus(guest.id, room.id);

    res.json({ tokensRemaining, secondsUntilNextToken, isCreator: false });
  } catch (err) {
    next(err);
  }
}
