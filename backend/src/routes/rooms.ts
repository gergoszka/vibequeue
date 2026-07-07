import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { createRoom, joinRoom, getRoom, endRoom, isCreator } from '../services/roomService';
import { startTokenScheduler } from '../services/tokenService';
import { loadPlaylist } from '../services/queueService';
import { getPlaylistItems } from '../services/youtubeService';
import { validate } from '../middleware/validate';
import { AppError } from '../types';
import type { GuestRow } from '../types';

const router = express.Router();

// POST /api/rooms
// Creates a room for the current session (idempotent).
router.post(
  '/',
  validate({
    tokenAllowance: {
      rules: [['min', 1], ['max', 20]],
      coerce: 'int',
      message: 'tokenAllowance must be 1-20',
    },
    tokenRefreshIntervalMinutes: {
      rules: [['oneOf', 15, 30, 60]],
      coerce: 'int',
      message: 'tokenRefreshIntervalMinutes must be 15, 30, or 60',
    },
  }),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const body = req.body as { tokenAllowance?: number; tokenRefreshIntervalMinutes?: number };
      const { tokenAllowance, tokenRefreshIntervalMinutes } = body;

      const room = createRoom({
        sessionId: req.session.id,
        tokenAllowance: tokenAllowance !== undefined ? Number(tokenAllowance) : undefined,
        tokenRefreshIntervalMinutes:
          tokenRefreshIntervalMinutes !== undefined ? Number(tokenRefreshIntervalMinutes) : undefined,
        youtubeAccessToken: req.session.youtube?.accessToken || null,
      });

      startTokenScheduler(room.id, room.code);

      res.status(201).json({
        roomCode: room.code,
        tokenAllowance: room.tokenAllowance,
        tokenRefreshIntervalMinutes: room.tokenRefreshIntervalMinutes,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/rooms/join
// Join a room as a guest (idempotent per session).
router.post(
  '/join',
  validate({
    code: {
      rules: ['required', 'alphanumeric5'],
      message: 'code must be 5 alphanumeric characters',
    },
    displayName: {
      rules: ['required', ['minLen', 1], ['maxLen', 30]],
      sanitize: true,
      message: 'displayName must be 1-30 characters',
    },
  }),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const body = req.body as { code: string; displayName: string };
      const { code, displayName } = body;

      const guest = joinRoom({
        sessionId: req.session.id,
        code: String(code).toUpperCase(),
        displayName: displayName.trim(),
      });

      res.status(200).json({
        roomCode: guest.code,
        guestId: guest.id,
        displayName: guest.displayName,
        tokensRemaining: guest.tokensRemaining,
        tokenRefreshIntervalMinutes: guest.tokenRefreshIntervalMinutes,
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      next(err);
    }
  }
);

// POST /api/rooms/:code/heartbeat
// Creator-only: updates last_activity_at to now. Returns { ok: true }.
router.post('/:code/heartbeat', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const room = getRoom(code);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!isCreator(room, req.session.id)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare('UPDATE rooms SET last_activity_at = ? WHERE id = ?').run(Date.now(), room.id);

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms/:code
// Returns room info. 404 if not found.
router.get('/:code', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const room = getRoom(code);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const guest = db
      .prepare(
        'SELECT id, display_name, tokens_remaining FROM guests WHERE room_id = ? AND session_id = ?'
      )
      .get(room.id, req.session.id) as Pick<GuestRow, 'id' | 'display_name' | 'tokens_remaining'> | undefined;

    res.status(200).json({
      code: room.code,
      isActive: room.is_active === 1,
      tokenAllowance: room.token_allowance,
      tokenRefreshIntervalMinutes: room.token_refresh_interval_minutes,
      isCreator: isCreator(room, req.session.id),
      guestSession: guest
        ? { guestId: guest.id, displayName: guest.display_name, tokensRemaining: guest.tokens_remaining }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:code/playlist
// Creator-only: load a YouTube playlist as the background queue.
router.post('/:code/playlist', (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const code = String(req.params.code).toUpperCase();
      const body = req.body as { playlistUrl?: string };

      if (!body.playlistUrl || typeof body.playlistUrl !== 'string') {
        res.status(400).json({ error: 'playlistUrl is required' });
        return;
      }

      let playlistId: string | null = null;
      try {
        playlistId = new URL(body.playlistUrl).searchParams.get('list');
      } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
      }

      if (!playlistId) {
        res.status(400).json({ error: 'Could not extract playlist ID from URL' });
        return;
      }

      const accessToken = req.session.youtube?.accessToken;
      if (!accessToken) {
        res.status(401).json({ error: 'Not authenticated with YouTube' });
        return;
      }

      const { items, nextPageToken } = await getPlaylistItems(playlistId, accessToken);
      if (items.length === 0) {
        res.status(400).json({ error: 'Playlist is empty or not accessible' });
        return;
      }

      const loaded = loadPlaylist(code, req.session.id, playlistId, items, nextPageToken);
      res.status(200).json({ loaded });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  })();
});

// DELETE /api/rooms/:code
// Ends a room. Only the creator may do this; non-creator receives 403.
router.delete('/:code', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    endRoom(code, req.session.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err.statusCode === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
    }
    next(err);
  }
});

export default router;
