import { useEffect, useRef, useCallback, useState } from 'react';
import { WsStatus } from '../types';
import { API_BASE, WS_URL } from '../config';
const MAX_RETRIES = 5;

interface UseWebSocketProps {
  roomCode: string | undefined;
  onQueueUpdated?: () => void;
  onNowPlaying?: (entry?: unknown) => void;
  onRoomClosed?: () => void;
  onTokenRefreshed?: (payload?: unknown) => void;
}

export function useWebSocket({ roomCode, onQueueUpdated, onNowPlaying, onRoomClosed, onTokenRefreshed }: UseWebSocketProps): { status: WsStatus } {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<WsStatus>('connecting');

  // Keep callback refs current without making them connect() dependencies.
  // Callers can pass inline functions freely — no useCallback required.
  const onQueueUpdatedRef = useRef(onQueueUpdated);
  const onNowPlayingRef = useRef(onNowPlaying);
  const onRoomClosedRef = useRef(onRoomClosed);
  const onTokenRefreshedRef = useRef(onTokenRefreshed);
  useEffect(() => { onQueueUpdatedRef.current = onQueueUpdated; });
  useEffect(() => { onNowPlayingRef.current = onNowPlaying; });
  useEffect(() => { onRoomClosedRef.current = onRoomClosed; });
  useEffect(() => { onTokenRefreshedRef.current = onTokenRefreshed; });

  const sessionIdRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    if (!roomCode) return;

    if (!sessionIdRef.current) {
      try {
        const res = await fetch(
          `${API_BASE}/api/auth/me`,
          { credentials: 'include' }
        );
        const data = await res.json() as { sessionId?: string };
        sessionIdRef.current = data.sessionId ?? null;
      } catch {
        // proceed without sessionId
      }
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setStatus(retriesRef.current > 0 ? 'reconnecting' : 'connecting');

    ws.onopen = () => {
      retriesRef.current = 0;
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'join_room', roomCode, sessionId: sessionIdRef.current }));
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: { type: string; payload?: unknown };
      try { msg = JSON.parse(event.data as string) as { type: string; payload?: unknown }; } catch { return; }

      switch (msg.type) {
        case 'queue_updated':
          onQueueUpdatedRef.current?.();
          break;
        case 'now_playing':
          onNowPlayingRef.current?.((msg.payload as { entry?: unknown })?.entry);
          break;
        case 'room_closed':
          onRoomClosedRef.current?.();
          break;
        case 'token_refreshed':
          onTokenRefreshedRef.current?.(msg.payload);
          break;
        default:
          break;
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (event.wasClean) return;
      if (retriesRef.current >= MAX_RETRIES) {
        setStatus('offline');
        return;
      }
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current += 1;
      setStatus('reconnecting');
      retryTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose fires right after onerror — handle reconnect there
    };
  }, [roomCode]); // callbacks are accessed via refs, so only roomCode drives reconnects

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, 'component unmounted');
      }
    };
  }, [connect]);

  return { status };
}
