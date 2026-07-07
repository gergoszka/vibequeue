import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from '../db';
import { cleanupEmitter } from '../services/cleanupService';
import { queueEmitter } from '../services/queueService';
import { tokenEmitter } from '../services/tokenService';
import type { RoomRow } from '../types';

// roomCode → Set<WebSocket>
const roomClients = new Map<string, Set<WebSocket>>();

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
}

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as ExtendedWebSocket;
    ws.isAlive = true;
    ws.roomCode = null;

    // 10-second timeout to receive join_room or disconnect
    const joinTimeout = setTimeout(() => {
      if (!ws.roomCode) ws.terminate();
    }, 10_000);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: { type?: string; roomCode?: string };
      try {
        msg = JSON.parse(data.toString()) as { type?: string; roomCode?: string };
      } catch {
        return;
      }

      if (msg.type === 'join_room') {
        const { roomCode } = msg;
        if (!roomCode) return;

        // Validate room exists and is active
        const room = db
          .prepare('SELECT code FROM rooms WHERE code = ? AND is_active = 1')
          .get(roomCode.toUpperCase()) as Pick<RoomRow, 'code'> | undefined;

        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          ws.terminate();
          return;
        }

        clearTimeout(joinTimeout);
        ws.roomCode = room.code;
        if (!roomClients.has(room.code)) roomClients.set(room.code, new Set());
        roomClients.get(room.code)!.add(ws);
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
    // Clean up the client set
    roomClients.delete(roomCode);
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
