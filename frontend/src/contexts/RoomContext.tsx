import { createContext, useContext, useState } from 'react';
import type { Room, Guest, QueueEntry } from '../types';
import { useQueue } from '../hooks/useQueue';
import { useTokenStatus } from '../hooks/useTokenStatus';

interface RoomContextValue {
  room: Room | null;
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>;
  isCreator: boolean;
  setIsCreator: React.Dispatch<React.SetStateAction<boolean>>;
  guest: Guest | null;
  setGuest: React.Dispatch<React.SetStateAction<Guest | null>>;
  // Live token status (polled from server; null for creators)
  tokensRemaining: number | null;
  secondsUntilNextToken: number | null;
  countdownDisplay: string | null;
  tokenStatusLoading: boolean;
  refreshTokenStatus: () => void;
  // Shared queue state — single source of truth for all room views
  entries: QueueEntry[];
  nowPlaying: QueueEntry | null;
  upcomingEntries: QueueEntry[];
  queueLoading: boolean;
  refetchQueue: () => Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);

interface RoomProviderProps {
  children: React.ReactNode;
}

export function RoomProvider({ children }: RoomProviderProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [guest, setGuest] = useState<Guest | null>(null);

  const {
    entries,
    nowPlaying,
    upcomingEntries,
    isLoading: queueLoading,
    refetch: refetchQueue,
  } = useQueue(room?.code);

  const {
    tokensRemaining,
    secondsUntilNextToken,
    countdownDisplay,
    isLoading: tokenStatusLoading,
    refresh: refreshTokenStatus,
  } = useTokenStatus(room?.code);

  return (
    <RoomContext.Provider value={{
      room, setRoom, isCreator, setIsCreator, guest, setGuest,
      tokensRemaining, secondsUntilNextToken, countdownDisplay, tokenStatusLoading, refreshTokenStatus,
      entries, nowPlaying, upcomingEntries, queueLoading, refetchQueue,
    }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
