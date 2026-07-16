import type { Request, Response, NextFunction } from 'express';
import { upsertUser } from '../services/authService';

/**
 * Injects a synthetic session user when TEST_MODE=true so smoke tests can call
 * authenticated endpoints without going through YouTube OAuth. Each unique
 * session (cookie jar) gets its own stable user in the database.
 */
export function testModeSessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.TEST_MODE !== 'true') { next(); return; }
  if (req.session.youtube?.userId) { next(); return; }

  const sessionId = req.session.id;
  const testEmail = `smoke-${sessionId.substring(0, 12)}@test.local`;

  try {
    const user = upsertUser(testEmail, sessionId);
    req.session.youtube = {
      userId: user.id,
      accessToken: 'test-access-token',
      refreshToken: null,
      expiryDate: null,
      email: testEmail,
    };
  } catch {
    // proceed without injection — route will return 401
  }

  next();
}
