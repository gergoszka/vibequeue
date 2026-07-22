import EventEmitter from 'events';
import { db } from '../db';
import { deductToken } from './tokenService';
import { isCreator } from './roomService';
import { QueueEntryRow, PublicQueueEntry, RoomRow, RoomMemberRow, AppError } from '../types';

export const queueEmitter = new EventEmitter();

export type AdvanceQueueResult =
  | { type: 'playing'; entry: PublicQueueEntry }
  | { type: 'empty' }
  | { type: 'fetch_more_playlist'; playlistId: string; pageToken: string };

function formatEntry(row: QueueEntryRow & { display_name?: string | null }, requestingUserId?: string): PublicQueueEntry {
  return {
    id: row.id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url || null,
    durationSeconds: row.duration_seconds || null,
    addedByDisplayName: row.display_name || 'Host',
    addedByCurrentUser: !!requestingUserId && row.added_by_user_id === requestingUserId,
    status: row.status,
    source: row.source ?? 'user',
    position: row.position,
    startedPlayingAt: row.started_playing_at ?? null,
  };
}

/**
 * Return all pending/playing queue entries for a room, ordered by position ASC.
 *
 * @throws {AppError} 404 if room not found
 */
export function getQueue(roomCode: string, requestingUserId?: string): PublicQueueEntry[] {
  const room = db
    .prepare('SELECT id FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as Pick<RoomRow, 'id'> | undefined;

  if (!room) throw new AppError('Room not found', 404);

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
              qe.added_by_user_id,
              qe.room_id,
              qe.added_at,
              u.display_name
         FROM queue_entries qe
         LEFT JOIN users u ON u.id = qe.added_by_user_id
        WHERE qe.room_id = ?
          AND qe.status IN ('pending', 'playing')
        ORDER BY CASE WHEN qe.source = 'user' THEN 0 ELSE 1 END ASC, qe.position ASC`
    )
    .all(room.id) as QueueEntryRow[];

  return rows.map(row => formatEntry(row, requestingUserId));
}

/**
 * Add a song to the queue.
 *
 * @throws {AppError} 404 room not found, 410 room inactive, 402 no tokens, 403 not in room
 */
export function addToQueue(
  roomCode: string,
  userId: string,
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

  if (!room) throw new AppError('Room not found', 404);
  if (!room.is_active) throw new AppError('Room is no longer active', 410);

  const hostAccess = isCreator(room.id, userId);

  const addEntry = db.transaction((): PublicQueueEntry => {
    if (!hostAccess) {
      const member = db
        .prepare(
          `SELECT id, tokens_remaining FROM room_members
           WHERE room_id = ? AND user_id = ? AND role = 'guest'`
        )
        .get(room.id, userId) as Pick<RoomMemberRow, 'id' | 'tokens_remaining'> | undefined;

      if (!member) throw new AppError('Not a member of this room', 403);
      if ((member.tokens_remaining ?? 0) <= 0) throw new AppError('Insufficient tokens', 402);

      deductToken(member.id);
    }

    const maxRow = db
      .prepare('SELECT MAX(position) AS max_pos FROM queue_entries WHERE room_id = ?')
      .get(room.id) as { max_pos: number | null };
    const position = (maxRow.max_pos || 0) + 1;

    const playingRow = db
      .prepare("SELECT id FROM queue_entries WHERE room_id = ? AND status = 'playing'")
      .get(room.id);
    const status: QueueEntryRow['status'] = playingRow ? 'pending' : 'playing';

    const id = crypto.randomUUID();
    const now = Date.now();
    const startedPlayingAt = status === 'playing' ? now : null;

    db.prepare(
      `INSERT INTO queue_entries
         (id, room_id, added_by_user_id, youtube_video_id, title, thumbnail_url,
          duration_seconds, position, status, source, added_at, started_playing_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`
    ).run(
      id, room.id, userId, youtubeVideoId, title,
      thumbnailUrl || null, durationSeconds || null,
      position, status, now, startedPlayingAt
    );

    db.prepare('UPDATE rooms SET last_activity_at = ? WHERE id = ?').run(now, room.id);

    let displayName: string | null = null;
    if (!hostAccess) {
      const userRow = db
        .prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string | null } | undefined;
      displayName = userRow?.display_name ?? null;
    }

    return formatEntry({
      id,
      room_id: room.id,
      added_by_user_id: userId,
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
 * Only the user who added the entry may remove it, and only while it is 'pending'.
 *
 * @throws {AppError} 404, 403
 */
export function removeEntry(roomCode: string, entryId: string, userId: string): void {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) throw new AppError('Room not found', 404);

  const entry = db
    .prepare('SELECT * FROM queue_entries WHERE id = ? AND room_id = ?')
    .get(entryId, room.id) as QueueEntryRow | undefined;

  if (!entry || entry.status === 'removed') throw new AppError('Queue entry not found', 404);

  if (entry.added_by_user_id !== userId) throw new AppError('Forbidden', 403);
  if (entry.status !== 'pending') throw new AppError('Forbidden', 403);

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
              qe.added_by_user_id,
              qe.added_at,
              qe.started_playing_at,
              u.display_name
         FROM queue_entries qe
         LEFT JOIN users u ON u.id = qe.added_by_user_id
        WHERE qe.room_id = ?
          AND qe.status = 'pending'
        ORDER BY CASE WHEN qe.source = 'user' THEN 0 ELSE 1 END ASC, qe.position ASC
        LIMIT 1`
    );

    const next = findNext.get(room.id) as QueueEntryRow | undefined;
    if (!next) return null;

    const nowTs = Date.now();
    db.prepare("UPDATE queue_entries SET status = 'playing', started_playing_at = ? WHERE id = ?").run(nowTs, next.id);
    return formatEntry({ ...next, status: 'playing', started_playing_at: nowTs });
  });

  const nextEntry = doRemove();
  if (wasPlaying) queueEmitter.emit('now_playing', roomCode.toUpperCase(), nextEntry);
  queueEmitter.emit('queue_updated', roomCode.toUpperCase());
}

/**
 * Advance the queue: marks current 'playing' entry as 'played', promotes next 'pending'.
 * Host only — throws 403 otherwise.
 */
export function advanceQueue(roomCode: string, userId: string): AdvanceQueueResult {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) throw new AppError('Room not found', 404);
  if (!isCreator(room.id, userId)) throw new AppError('Forbidden', 403);

  const advance = db.transaction((): AdvanceQueueResult => {
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
              qe.added_by_user_id,
              qe.added_at,
              qe.started_playing_at,
              u.display_name
         FROM queue_entries qe
         LEFT JOIN users u ON u.id = qe.added_by_user_id
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

  if (result.type !== 'fetch_more_playlist') {
    const entry = result.type === 'playing' ? result.entry : null;
    queueEmitter.emit('now_playing', roomCode.toUpperCase(), entry);
    queueEmitter.emit('queue_updated', roomCode.toUpperCase());
  }

  return result;
}

/**
 * Replace the playlist background queue. Host only.
 */
export function loadPlaylist(
  roomCode: string,
  userId: string,
  playlistId: string,
  items: Array<{ videoId: string; title: string; thumbnailUrl: string | null }>,
  nextPageToken?: string
): number {
  const room = db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as RoomRow | undefined;

  if (!room) throw new AppError('Room not found', 404);
  if (!isCreator(room.id, userId)) throw new AppError('Forbidden', 403);

  const hostMember = db
    .prepare(`SELECT user_id FROM room_members WHERE room_id = ? AND role = 'host'`)
    .get(room.id) as Pick<{ user_id: string }, 'user_id'> | undefined;

  const hostUserId = hostMember?.user_id ?? userId;

  const doLoad = db.transaction((): number => {
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
         (id, room_id, added_by_user_id, youtube_video_id, title, thumbnail_url,
          duration_seconds, position, status, source, added_at, started_playing_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', 'playlist', ?, NULL)`
    );

    for (const item of items) {
      insert.run(
        crypto.randomUUID(), room.id, hostUserId,
        item.videoId, item.title, item.thumbnailUrl,
        position++, now
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
 * Append a new page of playlist items without clearing existing entries.
 */
export function appendPlaylistItems(
  roomCode: string,
  playlistId: string,
  items: Array<{ videoId: string; title: string; thumbnailUrl: string | null }>,
  nextPageToken: string | undefined
): void {
  const room = db
    .prepare('SELECT id FROM rooms WHERE code = ?')
    .get(roomCode.toUpperCase()) as Pick<RoomRow, 'id'> | undefined;

  if (!room) return;

  const hostMember = db
    .prepare(`SELECT user_id FROM room_members WHERE room_id = ? AND role = 'host'`)
    .get(room.id) as { user_id: string } | undefined;

  if (!hostMember) return;

  db.transaction(() => {
    const maxRow = db
      .prepare('SELECT MAX(position) AS max_pos FROM queue_entries WHERE room_id = ?')
      .get(room.id) as { max_pos: number | null };
    let position = (maxRow.max_pos || 0) + 1;

    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO queue_entries
         (id, room_id, added_by_user_id, youtube_video_id, title, thumbnail_url,
          duration_seconds, position, status, source, added_at, started_playing_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'pending', 'playlist', ?, NULL)`
    );

    for (const item of items) {
      insert.run(
        crypto.randomUUID(), room.id, hostMember.user_id,
        item.videoId, item.title, item.thumbnailUrl,
        position++, now
      );
    }

    db.prepare('UPDATE rooms SET playlist_id = ?, playlist_next_page_token = ? WHERE id = ?')
      .run(playlistId, nextPageToken ?? null, room.id);
  })();
}
