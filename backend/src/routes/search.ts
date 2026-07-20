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

    const isMember = isCreator(room.id, userId) || !!db
      .prepare('SELECT id FROM room_members WHERE room_id = ? AND user_id = ?')
      .get(room.id, userId);

    if (!isMember) {
      res.status(403).json({ error: 'Not a room member' });
      return;
    }

    console.log(`[search] room=${roomCode} q="${q}"`);

    let results;
    try {
      results = await searchWithDetails(q);
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

// GET /api/search/suggestions?q=<query>
router.get('/suggestions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = ((req.query.q as string | undefined) || '').trim();
    if (!q) {
      res.status(200).json({ suggestions: [] });
      return;
    }

    const userId = req.session.youtube?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const params = new URLSearchParams({ client: 'youtube', q, hl: 'en' });
    const response = await fetch(`https://suggestqueries.google.com/complete/search?${params.toString()}`);
    // The API returns ISO-8859-1; decode correctly to preserve accented characters
    const bytes = await response.arrayBuffer();
    const text = new TextDecoder('iso-8859-1').decode(bytes);

    // Response is JSONP: window.google.ac.h(["query",[["suggestion",0,[512]],...]])
    const match = text.match(/\((.+)\)/s);
    if (!match) {
      res.status(200).json({ suggestions: [] });
      return;
    }

    const data = JSON.parse(match[1]) as [string, Array<[string, ...unknown[]]>];
    const suggestions = data[1].map((s) => s[0]).slice(0, 8);

    res.status(200).json({ suggestions });
  } catch (err) {
    next(err);
  }
});

export default router;
