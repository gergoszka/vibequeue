import type { Request, Response, NextFunction } from 'express';

/**
 * requireCreatorAuth — Express middleware
 * Rejects requests that do not have a YouTube access token in session.
 * Apply to any route that requires the room creator to be authenticated.
 */
export default function requireCreatorAuth(req: Request, res: Response, next: NextFunction): void {
  // Allow bypass in test mode so smoke tests can run without YouTube OAuth
  if (process.env.TEST_MODE === 'true') {
    next();
    return;
  }
  if (!req.session.youtube?.accessToken) {
    res.status(401).json({ error: 'YouTube authentication required' });
    return;
  }
  next();
}
