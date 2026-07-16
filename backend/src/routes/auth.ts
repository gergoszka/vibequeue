import express, { Request, Response, NextFunction } from 'express';
import {
  buildAuthUrl,
  exchangeCode,
  getUserEmail,
  refreshAccessToken,
  isTokenExpired,
  upsertUser,
  clearUserSession,
} from '../services/authService';
import { db } from '../db';
import type { RoomRow } from '../types';

const router = express.Router();

// GET /api/auth/youtube/url
router.get('/youtube/url', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const redirectUri =
      (req.query.redirectUri as string | undefined) ||
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`;

    const state = req.query.state as string | undefined;
    const url = buildAuthUrl({ redirectUri, state });

    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/youtube/callback
router.post('/youtube/callback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as { code?: string; redirectUri?: string } | undefined;
    const { code, redirectUri } = body || {};

    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }
    if (!redirectUri) {
      res.status(400).json({ error: 'redirectUri is required' });
      return;
    }

    let tokens;
    try {
      tokens = await exchangeCode({ code, redirectUri });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: 'OAuth exchange failed', detail: message });
      return;
    }

    let email: string;
    try {
      email = await getUserEmail(tokens.access_token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: 'OAuth exchange failed', detail: message });
      return;
    }

    const user = upsertUser(email, req.session.id, tokens.refresh_token);

    req.session.youtube = {
      accessToken: tokens.access_token,
      refreshToken: user.refresh_token,
      expiryDate: tokens.expiry_date,
      email,
      userId: user.id,
    };

    res.status(200).json({ success: true, email });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/active-room
// Returns the active room for the current user (as host or guest), or null.
router.get('/active-room', (req: Request, res: Response): void => {
  const userId = req.session.youtube?.userId;

  if (!userId) {
    res.status(200).json({ roomCode: null });
    return;
  }

  const hostRoom = db
    .prepare(
      `SELECT r.code FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id
       WHERE rm.user_id = ? AND rm.role = 'host' AND r.is_active = 1`
    )
    .get(userId) as Pick<RoomRow, 'code'> | undefined;

  if (hostRoom) {
    res.status(200).json({ roomCode: hostRoom.code, role: 'host' });
    return;
  }

  const guestRoom = db
    .prepare(
      `SELECT r.code FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id
       WHERE rm.user_id = ? AND rm.role = 'guest' AND r.is_active = 1`
    )
    .get(userId) as Pick<RoomRow, 'code'> | undefined;

  if (guestRoom) {
    res.status(200).json({ roomCode: guestRoom.code, role: 'guest' });
    return;
  }

  res.status(200).json({ roomCode: null });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response): void => {
  res.json({ sessionId: req.session.id });
});

// GET /api/auth/status
router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const yt = req.session.youtube;
    if (!yt?.accessToken) {
      res.status(200).json({ authenticated: false });
      return;
    }

    if (isTokenExpired(yt.expiryDate)) {
      if (yt.refreshToken) {
        try {
          const refreshed = await refreshAccessToken(yt.refreshToken);
          yt.accessToken = refreshed.access_token;
          yt.expiryDate = refreshed.expiry_date;
          await new Promise<void>((resolve, reject) =>
            req.session.save((err) => (err ? reject(err) : resolve()))
          );
        } catch {
          delete req.session.youtube;
          res.status(200).json({ authenticated: false });
          return;
        }
      } else {
        delete req.session.youtube;
        res.status(200).json({ authenticated: false });
        return;
      }
    }

    res.status(200).json({ authenticated: true, email: yt.email });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response, next: NextFunction): void => {
  const email = req.session.youtube?.email;
  if (email) {
    clearUserSession(email);
  }
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true });
  });
});

export default router;
