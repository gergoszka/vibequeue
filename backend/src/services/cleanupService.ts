import EventEmitter from 'events';
import { db } from '../db';
import { stopTokenScheduler } from './tokenService';
import { RoomRow } from '../types';

export const cleanupEmitter = new EventEmitter();

// started flag to prevent duplicate intervals
let watcherStarted = false;

/**
 * Start the inactivity watcher. Idempotent — subsequent calls are no-ops.
 * Schedules checkInactiveRooms to run every 5 minutes,
 * with an initial run 10 seconds after startup.
 */
export function startInactivityWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  setInterval(checkInactiveRooms, 5 * 60 * 1000); // every 5 minutes
  // Also run once immediately after a short delay
  setTimeout(checkInactiveRooms, 10_000);
}

/**
 * Query for active rooms where last_activity_at < (now - 1 hour)
 * AND no queue_entry with status='playing' exists for that room.
 * Mark each such room inactive, stop its token scheduler, and emit 'room_closed'.
 */
function checkInactiveRooms(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const inactiveRooms = db
    .prepare(
      `SELECT * FROM rooms
       WHERE is_active = 1
         AND last_activity_at < ?
         AND id NOT IN (
           SELECT DISTINCT room_id FROM queue_entries WHERE status = 'playing'
         )`
    )
    .all(oneHourAgo) as RoomRow[];

  for (const room of inactiveRooms) {
    try {
      db.prepare('UPDATE rooms SET is_active = 0 WHERE id = ?').run(room.id);
      stopTokenScheduler(room.id); // schedulers map is keyed by UUID (room.id)
      cleanupEmitter.emit('room_closed', room.code);
      console.log(`[cleanup] Room ${room.code} closed due to inactivity`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cleanup] Failed to close room ${room.code}:`, message);
    }
  }
}
