import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { QueueEntry } from '../types';

interface QueueResponse {
  entries: QueueEntry[];
}

export function useQueue(roomCode: string | undefined): {
  entries: QueueEntry[];
  nowPlaying: QueueEntry | null;
  upcomingEntries: QueueEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApi();

  const fetchQueue = useCallback(async () => {
    if (!roomCode) return;
    try {
      const data = await get<QueueResponse>(`/api/rooms/${roomCode}/queue`);
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const nowPlaying = entries.find(e => e.status === 'playing') ?? null;
  const upcomingEntries = entries.filter(e => e.status === 'pending');

  return { entries, nowPlaying, upcomingEntries, isLoading, error, refetch: fetchQueue };
}
