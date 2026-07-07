export interface Room {
  code: string;
  tokenAllowance: number;
  tokenRefreshIntervalMinutes: number;
}

export interface Guest {
  guestId: string;
  displayName: string;
  tokensRemaining: number;
}

export interface QueueEntry {
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

export interface SearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string;
  durationSeconds: number;
}

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
