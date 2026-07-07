import express, { Request, Response, NextFunction } from 'express';
import { buildAuthUrl, exchangeCode, getUserEmail, refreshAccessToken, isTokenExpired } from '../services/authService';

const router = express.Router();

// GET /api/auth/youtube/url
// Returns the Google OAuth URL.
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
// Body: { code, redirectUri }
// Exchanges auth code for tokens, stores them in session.
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

    req.session.youtube = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      email,
    };

    res.status(200).json({ success: true, email });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
// Returns the server-assigned session identity.
router.get('/me', (req: Request, res: Response): void => {
  res.json({ sessionId: req.session.id });
});

// GET /api/auth/status
// Returns authentication state. Auto-refreshes an expired access token when a
// refresh token is available so the caller never has to re-authenticate mid-session.
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
          // Refresh token revoked or expired — clear auth, session stays
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
// Destroys the entire session (clears YouTube auth and room membership).
router.post('/logout', (req: Request, res: Response, next: NextFunction): void => {
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
