import express, { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { createRoom, joinRoom, getRoom, endRoom, isCreator } from '../services/roomService';
import { startTokenScheduler } from '../services/tokenService';
import { loadPlaylist } from '../services/queueService';
import { getPlaylistItems } from '../services/youtubeService';
import { getRoomPresence } from '../ws/wsServer';
import { validate } from '../middleware/validate';
import { AppError } from '../types';
import type { RoomMemberRow, UserRow } from '../types';

const router = express.Router();

// POST /api/rooms
// Creates a room for the current user (idempotent).
router.post(
  '/',
  validate({
    displayName: {
      rules: ['required', ['minLen', 1], ['maxLen', 30]],
      sanitize: true,
      message: 'displayName must be 1-30 characters',
    },
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
      const userId = req.session.youtube?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const body = req.body as { displayName: string; tokenAllowance?: number; tokenRefreshIntervalMinutes?: number };
      const { displayName, tokenAllowance, tokenRefreshIntervalMinutes } = body;

      const room = createRoom({
        userId,
        displayName: displayName.trim(),
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
      const userId = req.session.youtube?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const body = req.body as { code: string; displayName: string };
      const { code, displayName } = body;

      const member = joinRoom({
        userId,
        code: String(code).toUpperCase(),
        displayName: displayName.trim(),
      });

      res.status(200).json({
        roomCode: member.code,
        guestId: member.id,
        displayName: member.displayName,
        tokensRemaining: member.tokensRemaining,
        tokenRefreshIntervalMinutes: member.tokenRefreshIntervalMinutes,
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        res.status(404).json({ error: (err as AppError).message });
        return;
      }
      next(err);
    }
  }
);

// POST /api/rooms/:code/heartbeat
router.post('/:code/heartbeat', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const userId = req.session.youtube?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const code = String(req.params.code).toUpperCase();
    const room = getRoom(code);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!isCreator(room.id, userId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    db.prepare('UPDATE rooms SET last_activity_at = ? WHERE id = ?').run(Date.now(), room.id);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms/mine
// Returns all active rooms the current user is a member of.
router.get('/mine', (req: Request, res: Response): void => {
  const userId = req.session.youtube?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT r.code, rm.role
         FROM rooms r
         JOIN room_members rm ON rm.room_id = r.id
        WHERE rm.user_id = ? AND r.is_active = 1
        ORDER BY r.last_activity_at DESC`
    )
    .all(userId) as Array<{ code: string; role: 'host' | 'guest' }>;

  res.status(200).json({ rooms: rows });
});

// GET /api/rooms/:code
router.get('/:code', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const room = getRoom(code);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const userId = req.session.youtube?.userId;

    const hostAccess = userId ? isCreator(room.id, userId) : false;

    const memberRow = userId
      ? (db
          .prepare(
            `SELECT rm.id, rm.tokens_remaining, u.display_name
               FROM room_members rm
               JOIN users u ON u.id = rm.user_id
              WHERE rm.room_id = ? AND rm.user_id = ? AND rm.role = 'guest'`
          )
          .get(room.id, userId) as
            | (Pick<RoomMemberRow, 'id' | 'tokens_remaining'> & Pick<UserRow, 'display_name'>)
            | undefined)
      : undefined;

    res.status(200).json({
      code: room.code,
      isActive: room.is_active === 1,
      tokenAllowance: room.token_allowance,
      tokenRefreshIntervalMinutes: room.token_refresh_interval_minutes,
      isCreator: hostAccess,
      guestSession: memberRow
        ? {
            guestId: memberRow.id,
            displayName: memberRow.display_name,
            tokensRemaining: memberRow.tokens_remaining,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/:code/playlist
router.post('/:code/playlist', (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const userId = req.session.youtube?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

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

      const loaded = loadPlaylist(code, userId, playlistId, items, nextPageToken);
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

// GET /api/rooms/:code/members
router.get('/:code/members', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const room = getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const rows = db
      .prepare(
        `SELECT u.id as userId, u.display_name as displayName, rm.role
           FROM room_members rm
           JOIN users u ON u.id = rm.user_id
          WHERE rm.room_id = ?
          ORDER BY rm.joined_at ASC`
      )
      .all(room.id) as Array<{ userId: string; displayName: string; role: string }>;

    const onlineUserIds = new Set(getRoomPresence(code).map((p) => p.userId));

    const members = rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      role: row.role,
      online: onlineUserIds.has(row.userId),
    }));

    res.status(200).json({ members });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rooms/:code
router.delete('/:code', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const userId = req.session.youtube?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const code = String(req.params.code).toUpperCase();
    endRoom(code, userId);
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
