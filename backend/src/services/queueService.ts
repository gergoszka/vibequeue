import EventEmitter from 'events';
import { db } from '../db';
import { deductToken } from './tokenService';
import { QueueEntryRow, PublicQueueEntry, RoomRow, GuestRow, AppError } from '../types';

export const queueEmitter = new EventEmitter();

export type AdvanceQueueResult =
  | { type: 'playing'; entry: PublicQueueEntry }
  | { type: 'empty' }
  | { type: 'fetch_more_playlist'; playlistId: string; pageToken: string };

/**
 * Map a raw queue_entries row + display_name into the public entry shape.
 */
function formatEntry(row: QueueEntryRow & { display_name?: string | null }): PublicQueueEntry {
  return {
    id: row.id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url || null,
    durationSeconds: row.duration_seconds || null,
    addedByDisplayName: row.display_name || 'Host',
    status: row.status,
    source: row.source ?? 'user',
    position: row.position,
    startedPlayingAt: row.started_playing_at ?? null,
  };
}

/**
 * Return all pending/playing queue entries for a room, ordered by position ASC.
 * Includes addedByDisplayName via LEFT JOIN on guests.
 *
 * @throws {AppError} with statusCode 404 if room not found
 */
export function getQueue(roomCode: string): PublicQueueEntry[] {
  const room = db
    .prepare('SELECT id FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as Pick<RoomRow, 'id'> | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  const rows = db
    .prepare(
      `SELECT qe.id,
              qe.youtube_video_id,
              qe.title,
              qe.thumbnail_url,
              qe.duration_seconds,
              qe.status,
              qe.source,
              qe.position,
              qe.started_playing_at,
              g.display_name
         FROM queue_entries qe
         LEFT JOIN guests g ON g.session_id = qe.added_by_session_id AND g.room_id = qe.room_id
        WHERE qe.room_id = ?
          AND qe.status IN ('pending', 'playing')
        ORDER BY CASE WHEN qe.source = 'user' THEN 0 ELSE 1 END ASC, qe.position ASC`
    )
    .all(room.id) as QueueEntryRow[];

  return rows.map(formatEntry);
}

/**
 * Add a song to the queue.
 *
 * @throws {AppError} statusCode 404 room not found, 410 room inactive, 402 no tokens, 403 not in room
 */
export function addToQueue(
  roomCode: string,
  sessionId: string,
  {
    youtubeVideoId,
    title,
    thumbnailUrl,
    durationSeconds,
  }: {
    youtubeVideoId: string;
    title: string;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
  }
): PublicQueueEntry {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  if (!room.is_active) {
    throw new AppError('Room is no longer active', 410);
  }

  const creatorSession = room.creator_session_id === sessionId;

  const addEntry = db.transaction((): PublicQueueEntry => {
    // If the caller is a guest, look them up and deduct a token
    if (!creatorSession) {
      const guest = db
        .prepare('SELECT id, tokens_remaining FROM guests WHERE room_id = ? AND session_id = ?')
        .get(room.id, sessionId) as Pick<GuestRow, 'id' | 'tokens_remaining'> | undefined;

      if (!guest) {
        throw new AppError('Guest not found in this room', 403);
      }

      if (guest.tokens_remaining <= 0) {
        throw new AppError('Insufficient tokens', 402);
      }

      // Deduct via tokenService (it operates on guestId)
      deductToken(guest.id);
    }

    // Determine position
    const maxRow = db
      .prepare('SELECT MAX(position) AS max_pos FROM queue_entries WHERE room_id = ?')
      .get(room.id) as { max_pos: number | null };
    const position = (maxRow.max_pos || 0) + 1;

    // Determine status: 'playing' if nothing is currently playing
    const playingRow = db
      .prepare("SELECT id FROM queue_entries WHERE room_id = ? AND status = 'playing'")
      .get(room.id);
    const status: QueueEntryRow['status'] = playingRow ? 'pending' : 'playing';

    const id = crypto.randomUUID();
    const now = Date.now();

    const startedPlayingAt = status === 'playing' ? now : null;
    db.prepare(
      `INSERT INTO queue_entries
         (id, room_id, added_by_session_id, youtube_video_id, title, thumbnail_url, duration_seconds, position, status, added_at, started_playing_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      room.id,
      sessionId,
      youtubeVideoId,
      title,
      thumbnailUrl || null,
      durationSeconds || null,
      position,
      status,
      now,
      startedPlayingAt
    );

    // Update room activity
    db.prepare('UPDATE rooms SET last_activity_at = ? WHERE id = ?').run(now, room.id);

    // Return the inserted row in public shape
    let displayName: string | null = null;
    if (!creatorSession) {
      const guestRow = db
        .prepare('SELECT display_name FROM guests WHERE room_id = ? AND session_id = ?')
        .get(room.id, sessionId) as Pick<GuestRow, 'display_name'> | undefined;
      displayName = guestRow ? guestRow.display_name : null;
    }

    return formatEntry({
      id,
      room_id: room.id,
      added_by_session_id: sessionId,
      youtube_video_id: youtubeVideoId,
      title,
      thumbnail_url: thumbnailUrl || null,
      duration_seconds: durationSeconds || null,
      display_name: displayName,
      status,
      source: 'user',
      position,
      added_at: now,
      started_playing_at: startedPlayingAt,
    });
  });

  const newEntry = addEntry();
  queueEmitter.emit('queue_updated', roomCode.toUpperCase());
  return newEntry;
}

/**
 * Remove (soft-delete) a queue entry.
 * - Creator may remove any non-removed entry.
 * - Guest may only remove their own 'pending' entries.
 *
 * @throws {AppError} statusCode 404, 403
 */
export function removeEntry(roomCode: string, entryId: string, sessionId: string): void {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  const entry = db
    .prepare('SELECT * FROM queue_entries WHERE id = ? AND room_id = ?')
    .get(entryId, room.id) as QueueEntryRow | undefined;

  if (!entry || entry.status === 'removed') {
    throw new AppError('Queue entry not found', 404);
  }

  const creatorSession = room.creator_session_id === sessionId;

  if (!creatorSession) {
    // Guest: must own the entry and it must be 'pending'
    if (entry.added_by_session_id !== sessionId) {
      throw new AppError('Forbidden', 403);
    }
    if (entry.status !== 'pending') {
      throw new AppError('Forbidden', 403);
    }
  }

  const wasPlaying = entry.status === 'playing';

  const doRemove = db.transaction((): PublicQueueEntry | null => {
    db.prepare("UPDATE queue_entries SET status = 'removed' WHERE id = ?").run(entryId);

    if (!wasPlaying) return null;

    const findNext = db.prepare(
      `SELECT qe.id,
              qe.youtube_video_id,
              qe.title,
              qe.thumbnail_url,
              qe.duration_seconds,
              qe.status,
              qe.source,
              qe.position,
              qe.room_id,
              qe.added_by_session_id,
              qe.added_at,
              qe.started_playing_at,
              g.display_name
         FROM queue_entries qe
         LEFT JOIN guests g ON g.session_id = qe.added_by_session_id AND g.room_id = qe.room_id
        WHERE qe.room_id = ?
          AND qe.status = 'pending'
        ORDER BY CASE WHEN qe.source = 'user' THEN 0 ELSE 1 END ASC, qe.position ASC
        LIMIT 1`
    );

    let next = findNext.get(room.id) as QueueEntryRow | undefined;

    if (!next) return null;

    const nowTs = Date.now();
    db.prepare("UPDATE queue_entries SET status = 'playing', started_playing_at = ? WHERE id = ?").run(nowTs, next.id);
    return formatEntry({ ...next, status: 'playing', started_playing_at: nowTs });
  });

  const nextEntry = doRemove();
  if (wasPlaying) {
    queueEmitter.emit('now_playing', roomCode.toUpperCase(), nextEntry);
  }
  queueEmitter.emit('queue_updated', roomCode.toUpperCase());
}

/**
 * Advance the queue: marks current 'playing' entry as 'played', promotes next
 * 'pending' entry (lowest position) to 'playing'.
 * Creator only — throws 403 otherwise.
 *
 * @returns the new playing entry in public shape, or null if queue is empty
 * @throws {AppError} statusCode 404, 403
 */
export function advanceQueue(roomCode: string, sessionId: string): AdvanceQueueResult {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) {
    throw new AppError('Room not found', 404);
  }

  if (room.creator_session_id !== sessionId) {
    throw new AppError('Forbidden', 403);
  }

  const advance = db.transaction((): AdvanceQueueResult => {
    // Mark current playing entry as played
    db.prepare(
      "UPDATE queue_entries SET status = 'played' WHERE room_id = ? AND status = 'playing'"
    ).run(room.id);

    const findNext = db.prepare(
      `SELECT qe.id,
              qe.youtube_video_id,
              qe.title,
              qe.thumbnail_url,
              qe.duration_seconds,
              qe.status,
              qe.source,
              qe.position,
              qe.room_id,
              qe.added_by_session_id,
              qe.added_at,
              qe.started_playing_at,
              g.display_name
         FROM queue_entries qe
         LEFT JOIN guests g ON g.session_id = qe.added_by_session_id AND g.room_id = qe.room_id
        WHERE qe.room_id = ?
          AND qe.status = 'pending'
        ORDER BY CASE WHEN qe.source = 'user' THEN 0 ELSE 1 END ASC, qe.position ASC
        LIMIT 1`
    );

    let next = findNext.get(room.id) as QueueEntryRow | undefined;

    const now = Date.now();
    db.prepare('UPDATE rooms SET last_activity_at = ? WHERE id = ?').run(now, room.id);

    if (!next) {
      const { n } = db
        .prepare(
          "SELECT COUNT(*) as n FROM queue_entries WHERE room_id = ? AND source = 'playlist' AND status = 'played'"
        )
        .get(room.id) as { n: number };

      if (n > 0) {
        // If there's a next page token, signal the caller to fetch more before looping
        const tokenRow = db
          .prepare('SELECT playlist_id, playlist_next_page_token FROM rooms WHERE id = ?')
          .get(room.id) as { playlist_id: string | null; playlist_next_page_token: string | null };

        if (tokenRow.playlist_id && tokenRow.playlist_next_page_token) {
          return {
            type: 'fetch_more_playlist',
            playlistId: tokenRow.playlist_id,
            pageToken: tokenRow.playlist_next_page_token,
          };
        }

        // No more pages — loop from the beginning
        db.prepare(
          "UPDATE queue_entries SET status = 'pending' WHERE room_id = ? AND source = 'playlist' AND status = 'played'"
        ).run(room.id);
        next = findNext.get(room.id) as QueueEntryRow | undefined;
      }

      if (!next) return { type: 'empty' };
    }

    db.prepare("UPDATE queue_entries SET status = 'playing', started_playing_at = ? WHERE id = ?").run(now, next.id);

    return { type: 'playing', entry: formatEntry({ ...next, status: 'playing', started_playing_at: now }) };
  });

  const result = advance();

  // Only emit events when the advance is resolved — not when we're signalling the caller to fetch more
  if (result.type !== 'fetch_more_playlist') {
    const entry = result.type === 'playing' ? result.entry : null;
    queueEmitter.emit('now_playing', roomCode.toUpperCase(), entry);
    queueEmitter.emit('queue_updated', roomCode.toUpperCase());
  }

  return result;
}

/**
 * Replace the playlist background queue for a room.
 * Removes all existing playlist entries (pending and played), then inserts
 * the new items. Creator-only.
 *
 * @returns number of items inserted
 * @throws {AppError} 404 room not found, 403 not creator
 */
export function loadPlaylist(
  roomCode: string,
  sessionId: string,
  playlistId: string,
  items: Array<{ videoId: string; title: string; thumbnailUrl: string | null }>,
  nextPageToken?: string
): number {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) throw new AppError('Room not found', 404);
  if (room.creator_session_id !== sessionId) throw new AppError('Forbidden', 403);

  const doLoad = db.transaction((): number => {
    // Clear all existing playlist entries for this room
    db.prepare(
      "UPDATE queue_entries SET status = 'removed' WHERE room_id = ? AND source = 'playlist'"
    ).run(room.id);

    const maxRow = db
      .prepare('SELECT MAX(position) AS max_pos FROM queue_entries WHERE room_id = ?')
      .get(room.id) as { max_pos: number | null };
    let position = (maxRow.max_pos || 0) + 1;

    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO queue_entries
         (id, room_id, added_by_session_id, youtube_video_id, title, thumbnail_url,
          duration_seconds, position, status, source, added_at, started_playing_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', 'playlist', ?, NULL)`
    );

    for (const item of items) {
      insert.run(
        crypto.randomUUID(),
        room.id,
        room.creator_session_id,
        item.videoId,
        item.title,
        item.thumbnailUrl,
        position++,
        now
      );
    }

    db.prepare('UPDATE rooms SET playlist_id = ?, playlist_next_page_token = ? WHERE id = ?')
      .run(playlistId, nextPageToken ?? null, room.id);

    return items.length;
  });

  const count = doLoad();
  queueEmitter.emit('queue_updated', roomCode.toUpperCase());
  return count;
}

/**
 * Append a new page of playlist items to the queue without clearing existing entries.
 * Called by the advance route when the playlist runs out and more pages are available.
 */
export function appendPlaylistItems(
  roomCode: string,
  playlistId: string,
  items: Array<{ videoId: string; title: string; thumbnailUrl: string | null }>,
  nextPageToken: string | undefined
): void {
  const room = db
    .prepare('SELECT id, creator_session_id FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as Pick<RoomRow, 'id' | 'creator_session_id'> | undefined;

  if (!room) return;

  db.transaction(() => {
    const maxRow = db
      .prepare('SELECT MAX(position) AS max_pos FROM queue_entries WHERE room_id = ?')
      .get(room.id) as { max_pos: number | null };
    let position = (maxRow.max_pos || 0) + 1;

    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO queue_entries
         (id, room_id, added_by_session_id, youtube_video_id, title, thumbnail_url,
          duration_seconds, position, status, source, added_at, started_playing_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', 'playlist', ?, NULL)`
    );

    for (const item of items) {
      insert.run(
        crypto.randomUUID(),
        room.id,
        room.creator_session_id,
        item.videoId,
        item.title,
        item.thumbnailUrl,
        position++,
        now
      );
    }

    db.prepare('UPDATE rooms SET playlist_id = ?, playlist_next_page_token = ? WHERE id = ?')
      .run(playlistId, nextPageToken ?? null, room.id);
  })();
}
