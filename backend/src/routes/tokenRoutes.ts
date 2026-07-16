import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { getTokenStatus, refreshTokens } from '../services/tokenService';
import { isCreator } from '../services/roomService';
import type { RoomRow, RoomMemberRow } from '../types';

/**
 * GET /api/rooms/:code/token-status
 *
 * Responses:
 *  - 200 { tokensRemaining: null, isCreator: true }                          — host
 *  - 200 { tokensRemaining: number, secondsUntilNextToken: number, isCreator: false } — guest member
 *  - 401 { error: 'Not authenticated' }
 *  - 404 { error: 'Room not found' }
 *  - 404 { error: 'Not a member of this room' }
 */
export async function tokenStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.session.youtube?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { code } = req.params;

    const room = db
      .prepare('SELECT id FROM rooms WHERE code = ? AND is_active = 1')
      .get(code) as Pick<RoomRow, 'id'> | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (isCreator(room.id, userId)) {
      res.json({ tokensRemaining: null, isCreator: true });
      return;
    }

    const member = db
      .prepare(`SELECT id FROM room_members WHERE room_id = ? AND user_id = ? AND role = 'guest'`)
      .get(room.id, userId) as Pick<RoomMemberRow, 'id'> | undefined;

    if (!member) {
      res.status(404).json({ error: 'Not a member of this room' });
      return;
    }

    refreshTokens(room.id);
    const { tokensRemaining, secondsUntilNextToken } = getTokenStatus(member.id, room.id);

    res.json({ tokensRemaining, secondsUntilNextToken, isCreator: false });
  } catch (err) {
    next(err);
  }
}
