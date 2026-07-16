import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { isCreator } from '../services/roomService';
import { searchWithDetails } from '../services/youtubeService';
import type { RoomRow } from '../types';

const router = express.Router();

// GET /api/search?q=<query>&roomCode=<code>
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

    const userId = req.session.youtube?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const room = db
      .prepare('SELECT * FROM rooms WHERE code = ? AND is_active = 1')
      .get(roomCode) as RoomRow | undefined;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const hostAccess = isCreator(room.id, userId);

    if (!hostAccess) {
      const isMember = db
        .prepare('SELECT id FROM room_members WHERE room_id = ? AND user_id = ?')
        .get(room.id, userId);

      if (!isMember) {
        res.status(403).json({ error: 'Not a room member' });
        return;
      }
    }

    // Token selection: host uses their live session token; guests fall back to
    // the room's stored token so they can search even if their OAuth scope is limited.
    let accessToken: string | null;
    if (hostAccess) {
      accessToken = req.session.youtube?.accessToken ?? null;
      if (!accessToken) {
        res.status(503).json({ error: 'Please sign in with YouTube to search' });
        return;
      }
    } else {
      accessToken = req.session.youtube?.accessToken ?? room.youtube_access_token ?? null;
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
