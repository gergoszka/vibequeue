import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { isCreator } from '../services/roomService';
import { searchWithDetails } from '../services/youtubeService';
import type { RoomRow, GuestRow } from '../types';

const router = express.Router();

// GET /api/search?q=<query>&roomCode=<code>
// Proxies a YouTube music video search using the creator's access token.
// Accessible to the room creator and all joined guests.
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = ((req.query.q as string | undefined) || '').trim();
    const roomCode = ((req.query.roomCode as string | undefined) || '').trim().toUpperCase();

    if (!q || q.length < 2) {
      res.status(400).json({ error: 'Query required', details: { q: 'must be at least 2 characters' } });
      return;
    }
    if (q.length > 100) {
      res.status(400).json({ error: 'Query too long', details: { q: 'must be at most 100 characters' } });
      return;
    }
    if (!roomCode || !/^[A-Z0-9]{5}$/.test(roomCode)) {
      res.status(400).json({ error: 'Room code required', details: { roomCode: 'must be 5 alphanumeric characters' } });
      return;
    }

    // Look up active room
    const room = db
      .prepare('SELECT * FROM rooms WHERE code = ? AND is_active = 1')
      .get(roomCode) as RoomRow | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const sessionId = req.session.id;
    const creatorAccess = isCreator(room, sessionId);

    // Check if requester is a guest in this room
    const guestRecord = creatorAccess
      ? null
      : (db
          .prepare('SELECT id FROM guests WHERE room_id = ? AND session_id = ?')
          .get(room.id, sessionId) as Pick<GuestRow, 'id'> | undefined);

    if (!creatorAccess && !guestRecord) {
      res.status(403).json({ error: 'Not a room member' });
      return;
    }

    // Token selection: creator uses their live session token; guests fall back to
    // the creator's stored room token because their own Google OAuth token may
    // not have the youtube scope granted (common when the OAuth app is in
    // testing mode and the guest is not a listed test user).
    let accessToken: string | null;
    if (creatorAccess) {
      accessToken = req.session.youtube?.accessToken ?? null;
      if (!accessToken) {
        res.status(503).json({ error: 'Please sign in with YouTube to search' });
        return;
      }
    } else {
      accessToken =
        req.session.youtube?.accessToken ?? room.youtube_access_token ?? null;
      if (!accessToken) {
        res.status(503).json({ error: 'Search unavailable – room not connected to YouTube' });
        return;
      }
    }

    console.log(`[search] room=${roomCode} q="${q}"`);

    let results;
    try {
      results = await searchWithDetails(q, accessToken);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[search] YouTube API error:', message);
      res.status(502).json({ error: 'Search unavailable' });
      return;
    }

    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
