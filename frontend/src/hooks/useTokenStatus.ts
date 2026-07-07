import { useState, useEffect, useRef, useCallback } from 'react';
import { useApi } from './useApi';

interface TokenStatusResponse {
  tokensRemaining: number | null;
  secondsUntilNextToken: number;
  isCreator?: boolean;
}

export function useTokenStatus(roomCode: string | undefined): {
  tokensRemaining: number | null;
  secondsUntilNextToken: number | null;
  countdownDisplay: string | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);
  const [secondsUntilNextToken, setSecondsUntilNextToken] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { get } = useApi();

  const fetchStatus = useCallback(async () => {
    if (!roomCode) return;
    try {
      const data = await get<TokenStatusResponse>(`/api/rooms/${roomCode}/token-status`);
      setTokensRemaining(data.tokensRemaining);
      setSecondsUntilNextToken(Math.ceil(data.secondsUntilNextToken || 0));
    } catch {
      // Silently fail — keep displaying last known state
    } finally {
      setIsLoading(false);
    }
  }, [roomCode]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Countdown tick: decrement every second
  useEffect(() => {
    if (secondsUntilNextToken === null) return;

    intervalRef.current = setInterval(() => {
      setSecondsUntilNextToken(prev => {
        if (prev === null || prev <= 1) {
          // Countdown hit zero — re-fetch from server to get updated token count
          fetchStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsUntilNextToken === null, fetchStatus]);
  // NOTE: only re-start the interval when secondsUntilNextToken goes from null→set,
  // not on every tick. The state update happens inside the interval callback.

  // Format countdown as M:SS
  const countdownDisplay: string | null = (() => {
    if (secondsUntilNextToken === null) return null;
    const m = Math.floor(secondsUntilNextToken / 60);
    const s = String(secondsUntilNextToken % 60).padStart(2, '0');
    return `${m}:${s}`;
  })();

  // External refresh (called by WS token_refreshed event)
  const refresh = useCallback(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { tokensRemaining, secondsUntilNextToken, countdownDisplay, isLoading, refresh };
}
