import { db } from '../db';
import type { UserRow } from '../types';

if (!process.env.YOUTUBE_CLIENT_ID) {
  console.warn(
    '[authService] WARNING: YOUTUBE_CLIENT_ID is not set. YouTube OAuth will not function.'
  );
}
if (!process.env.YOUTUBE_CLIENT_SECRET) {
  console.warn(
    '[authService] WARNING: YOUTUBE_CLIENT_SECRET is not set. YouTube OAuth will not function.'
  );
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// 5-minute buffer so we refresh before expiry, not exactly at it
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube email';

interface AuthTokens {
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  id_token: string | null;
}

/**
 * buildAuthUrl({ redirectUri, state? }) → string
 */
export function buildAuthUrl({ redirectUri, state }: { redirectUri: string; state?: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent',
  });

  if (state !== undefined && state !== null) {
    params.set('state', state);
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * exchangeCode({ code, redirectUri })
 * → Promise<{ access_token, refresh_token, expiry_date, id_token }>
 */
export async function exchangeCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<AuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.YOUTUBE_CLIENT_ID || '',
    client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error('[authService] Token exchange failed:', response.status, JSON.stringify(data));
    const detail =
      (data.error_description as string) ||
      (data.error as string) ||
      response.statusText ||
      String(response.status);
    throw new Error(`Token exchange failed: ${detail}`);
  }

  const expiryDate =
    typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : null;

  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string | undefined) || null,
    expiry_date: expiryDate,
    id_token: (data.id_token as string | undefined) || null,
  };
}

/**
 * refreshAccessToken(refreshToken) → Promise<{ access_token, expiry_date }>
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expiry_date: number }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.YOUTUBE_CLIENT_ID || '',
    client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error('[authService] Token refresh failed:', response.status, JSON.stringify(data));
    const detail =
      (data.error_description as string) ||
      (data.error as string) ||
      response.statusText;
    throw new Error(`Token refresh failed: ${detail}`);
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    access_token: data.access_token as string,
    expiry_date: Date.now() + expiresIn * 1000,
  };
}

/**
 * isTokenExpired(expiryDate) → boolean
 */
export function isTokenExpired(expiryDate: number | null): boolean {
  if (expiryDate === null) return false;
  return expiryDate - EXPIRY_BUFFER_MS < Date.now();
}

/**
 * upsertUser — create a user row on first login, or update session_id (and
 * refresh_token when a new one is issued) on subsequent logins.
 * Returns the full UserRow so the caller can store userId in session.
 */
export function upsertUser(
  email: string,
  sessionId: string,
  refreshToken?: string | null
): UserRow {
  const now = Date.now();

  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, session_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), email, sessionId, now);

  if (refreshToken) {
    db.prepare(
      'UPDATE users SET session_id = ?, refresh_token = ?, refresh_token_updated_at = ? WHERE email = ?'
    ).run(sessionId, refreshToken, now, email);
  } else {
    db.prepare('UPDATE users SET session_id = ? WHERE email = ?').run(sessionId, email);
  }

  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow;
}

/**
 * clearUserSession — called on logout. Clears session_id and refresh_token so
 * the user must re-authorise with Google on next login.
 */
export function clearUserSession(email: string): void {
  db.prepare(
    'UPDATE users SET session_id = NULL, refresh_token = NULL WHERE email = ?'
  ).run(email);
}

/**
 * getUserEmail(accessToken) → Promise<string>
 */
export async function getUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorObj = data.error as Record<string, unknown> | undefined;
    const detail = (errorObj?.message as string | undefined) || response.statusText;
    throw new Error(`Failed to fetch user info: ${detail}`);
  }

  return data.email as string;
}
