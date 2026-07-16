import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from '../db';
import { cleanupEmitter } from '../services/cleanupService';
import { queueEmitter } from '../services/queueService';
import { tokenEmitter } from '../services/tokenService';
import type { RoomRow, UserRow, RoomMemberRow } from '../types';

// roomCode → Set<WebSocket>
const roomClients = new Map<string, Set<WebSocket>>();

// roomCode → Map<userId, {displayName, role}>
const roomPresence = new Map<string, Map<string, { displayName: string; role: string }>>();

export interface RoomMemberPresence {
  userId: string;
  displayName: string;
  role: string;
}

export function getRoomPresence(roomCode: string): RoomMemberPresence[] {
  const presence = roomPresence.get(roomCode);
  if (!presence) return [];
  return Array.from(presence.entries()).map(([userId, info]) => ({
    userId,
    displayName: info.displayName,
    role: info.role,
  }));
}

export function broadcast(roomCode: string, type: string, payload: unknown): void {
  const clients = roomClients.get(roomCode);
  if (!clients) return;
  const message = JSON.stringify({ type, payload });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Augment WebSocket with custom properties
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  roomCode: string | null;
  userId: string | null;
}

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as ExtendedWebSocket;
    ws.isAlive = true;
    ws.roomCode = null;
    ws.userId = null;

    // 10-second timeout to receive join_room or disconnect
    const joinTimeout = setTimeout(() => {
      if (!ws.roomCode) ws.terminate();
    }, 10_000);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: { type?: string; roomCode?: string; sessionId?: string };
      try {
        msg = JSON.parse(data.toString()) as { type?: string; roomCode?: string; sessionId?: string };
      } catch {
        return;
      }

      if (msg.type === 'join_room') {
        const { roomCode, sessionId } = msg;
        if (!roomCode) return;

        // Validate room exists and is active
        const room = db
          .prepare('SELECT id, code FROM rooms WHERE code = ? AND is_active = 1')
          .get(roomCode.toUpperCase()) as Pick<RoomRow, 'id' | 'code'> | undefined;

        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          ws.terminate();
          return;
        }

        clearTimeout(joinTimeout);
        ws.roomCode = room.code;
        if (!roomClients.has(room.code)) roomClients.set(room.code, new Set());
        roomClients.get(room.code)!.add(ws);

        // Resolve user identity from session_id and track presence
        if (sessionId) {
          const userRow = db
            .prepare('SELECT id, display_name FROM users WHERE session_id = ?')
            .get(sessionId) as Pick<UserRow, 'id' | 'display_name'> | undefined;

          if (userRow) {
            const memberRow = db
              .prepare('SELECT role FROM room_members WHERE room_id = ? AND user_id = ?')
              .get(room.id, userRow.id) as Pick<RoomMemberRow, 'role'> | undefined;

            if (memberRow) {
              ws.userId = userRow.id;
              if (!roomPresence.has(room.code)) roomPresence.set(room.code, new Map());
              roomPresence.get(room.code)!.set(userRow.id, {
                displayName: userRow.display_name ?? '',
                role: memberRow.role,
              });
              broadcast(room.code, 'users_updated', getRoomPresence(room.code));
            }
          }
        }

        ws.send(JSON.stringify({ type: 'joined', roomCode: room.code }));
      }
    });

    ws.on('close', () => {
      if (ws.roomCode) {
        const clients = roomClients.get(ws.roomCode);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) roomClients.delete(ws.roomCode!);
        }
        if (ws.userId) {
          const presence = roomPresence.get(ws.roomCode);
          if (presence) {
            presence.delete(ws.userId);
            if (presence.size === 0) roomPresence.delete(ws.roomCode);
            else broadcast(ws.roomCode, 'users_updated', getRoomPresence(ws.roomCode));
          }
        }
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[ws] client error:', err.message);
    });
  });

  // Ping/pong heartbeat every 30 seconds.
  const pingInterval = setInterval(() => {
    wss.clients.forEach((rawWs: WebSocket) => {
      const ws = rawWs as ExtendedWebSocket;
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(pingInterval));

  // Subscribe to room closure events
  cleanupEmitter.on('room_closed', (roomCode: string) => {
    broadcast(roomCode, 'room_closed', { roomCode });
    // Clean up the client set and presence map
    roomClients.delete(roomCode);
    roomPresence.delete(roomCode);
  });

  // Subscribe to queue mutation events
  queueEmitter.on('queue_updated', (roomCode: string) => {
    broadcast(roomCode, 'queue_updated', {});
  });
  queueEmitter.on('now_playing', (roomCode: string, entry: unknown) => {
    broadcast(roomCode, 'now_playing', { entry });
  });
  tokenEmitter.on('tokens_refreshed', (roomCode: string) => {
    broadcast(roomCode, 'token_refreshed', {});
  });

  console.log('[ws] WebSocket server attached to HTTP server');
  return wss;
}
