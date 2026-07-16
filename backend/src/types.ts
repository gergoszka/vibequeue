import type { Request, Response, NextFunction } from 'express';

// ─── DB row shapes (raw better-sqlite3 rows) ─────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  session_id: string | null;
  refresh_token: string | null;
  refresh_token_updated_at: number | null;
  created_at: number;
}

export interface RoomRow {
  id: string;
  code: string;
  youtube_access_token: string | null;
  token_allowance: number;
  token_refresh_interval_minutes: number;
  created_at: number;
  last_activity_at: number;
  is_active: number; // SQLite boolean: 0 | 1
  playlist_id: string | null;
  playlist_next_page_token: string | null;
}

export interface RoomMemberRow {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'guest';
  tokens_remaining: number | null;
  last_token_refresh_at: number | null;
  joined_at: number;
}

export interface QueueEntryRow {
  id: string;
  room_id: string;
  added_by_user_id: string;
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  position: number;
  status: 'pending' | 'playing' | 'played' | 'removed';
  source: 'user' | 'playlist';
  added_at: number;
  started_playing_at: number | null;
  // from LEFT JOIN users
  display_name?: string | null;
}

// ─── Public (API response) shapes ────────────────────────────────────────────

export interface PublicQueueEntry {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  addedByDisplayName: string;
  status: 'pending' | 'playing' | 'played' | 'removed';
  source: 'user' | 'playlist';
  position: number;
  startedPlayingAt: number | null;
}

export interface PublicRoom {
  id: string;
  code: string;
  tokenAllowance: number;
  tokenRefreshIntervalMinutes: number;
}

// ─── AppError ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

// ─── express-session augmentation ────────────────────────────────────────────

declare module 'express-session' {
  interface SessionData {
    youtube?: {
      accessToken: string;
      refreshToken: string | null;
      expiryDate: number | null;
      email: string;
      userId: string;
    };
  }
}

// ─── connect-sqlite3 shim (no official @types) ───────────────────────────────
// The actual declaration is in src/connect-sqlite3.d.ts so it compiles as a
// project-level ambient module (not augmenting an untyped module).


// ─── Express handler alias ───────────────────────────────────────────────────
export type Handler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
