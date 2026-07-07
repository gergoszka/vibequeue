import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../contexts/RoomContext';
import { RoomProvider } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import GuestJoinForm from '../components/GuestJoinForm';
import GuestAuthPrompt from '../components/GuestAuthPrompt';
import CreatorRoomView from '../components/CreatorRoomView';
import GuestRoomView from '../components/GuestRoomView';
import ConnectionStatus from '../components/ConnectionStatus';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';
import type { Room, Guest } from '../types';
import { ApiError } from '../types';

interface RoomResponse {
  code: string;
  tokenAllowance: number;
  tokenRefreshIntervalMinutes: number;
  isCreator: boolean;
  guestSession?: Guest;
}

function RoomPageInner() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { room, setRoom, isCreator, setIsCreator, guest, setGuest, refetchQueue, refreshTokenStatus } = useRoom();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { get } = useApi();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const roomCode = code.toUpperCase();
    get<RoomResponse>(`/api/rooms/${roomCode}`)
      .then((data) => {
        const roomData: Room = {
          code: data.code,
          tokenAllowance: data.tokenAllowance,
          tokenRefreshIntervalMinutes: data.tokenRefreshIntervalMinutes,
        };
        setRoom(roomData);
        setIsCreator(data.isCreator);
        if (data.guestSession) {
          setGuest(data.guestSession);
        }
      })
      .catch((err: ApiError) => {
        if (err.status === 404) {
          setError('Room not found or has ended.');
        } else if (err.status === 410) {
          setError('This room has ended.');
        } else {
          setError('Failed to load room. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleRoomClosed = useCallback(() => {
    navigate('/', { state: { roomEnded: true } });
  }, [navigate]);

  const { status: wsStatus } = useWebSocket({
    roomCode: room?.code ?? code?.toUpperCase(),
    onQueueUpdated: refetchQueue,
    onNowPlaying: () => {},
    onRoomClosed: handleRoomClosed,
    onTokenRefreshed: refreshTokenStatus,
  });

  // Polling fallback: when WS has exhausted retries, poll every 10 seconds
  useEffect(() => {
    if (wsStatus !== 'offline') return;
    const intervalId = setInterval(refetchQueue, 10000);
    return () => clearInterval(intervalId);
  }, [wsStatus, refetchQueue]);

  // Warn the creator before they close/navigate away.
  useEffect(() => {
    if (!isCreator) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Leaving will stop the music for everyone. Are you sure?';
      // Best-effort beacon to update last_activity_at
      if (room?.code) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/api/rooms/${room.code}/heartbeat`
        );
      }
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCreator, room?.code]);

  if (loading) return <div className="flex justify-center mt-20"><LoadingSpinner /></div>;
  if (error) return <div className="max-w-md mx-auto mt-12"><ErrorMessage message={error} /></div>;

  return (
    <>
      <div className="flex justify-end px-4 pt-2">
        <ConnectionStatus status={wsStatus} />
      </div>
      <ErrorBoundary>
        {isCreator && <CreatorRoomView />}
        {!isCreator && guest && <GuestRoomView />}
        {!isCreator && !guest && isAuthenticated && code && <GuestJoinForm roomCode={code.toUpperCase()} />}
        {!isCreator && !guest && !isAuthenticated && !authLoading && code && <GuestAuthPrompt roomCode={code.toUpperCase()} />}
      </ErrorBoundary>
    </>
  );
}

export default function RoomPage() {
  return (
    <Layout>
      <RoomProvider>
        <RoomPageInner />
      </RoomProvider>
    </Layout>
  );
}
