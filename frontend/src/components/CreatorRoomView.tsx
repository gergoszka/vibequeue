import { useEffect, useState, useCallback } from 'react';
import YoutubePlayer, { PLAYER_CONTAINER_ID } from './YoutubePlayer';
import { useRoom } from '../contexts/RoomContext';
import { useYoutubePlayer } from '../hooks/useYoutubePlayer';
import QueueDisplay from './QueueDisplay';
import SearchPanel from './SearchPanel';
import CreatorControls from './CreatorControls';
import { API_BASE } from '../config';

export default function CreatorRoomView() {
  const { room, nowPlaying, upcomingEntries, queueLoading: isLoading, refetchQueue: refetch } = useRoom();
  const [advancing, setAdvancing] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  // Heartbeat: keep the room alive every 2 minutes
  useEffect(() => {
    if (!room?.code) return;
    const interval = setInterval(async () => {
      try {
        await fetch(`${API_BASE}/api/rooms/${room.code}/heartbeat`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        console.warn('[heartbeat] failed:', (err as Error).message);
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [room?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnded = useCallback(async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await fetch(`${API_BASE}/api/rooms/${room?.code}/queue/advance`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[player] advance failed:', err);
    } finally {
      setAdvancing(false);
    }
  }, [room?.code, advancing]);

  const handleError = useCallback(async (_code: number) => {
    setSkipError('Skipping unavailable video…');
    setTimeout(() => setSkipError(null), 3000);
    await handleEnded();
  }, [handleEnded]);

  const { muted, unmute, stop } = useYoutubePlayer({
    containerId: PLAYER_CONTAINER_ID,
    videoId: nowPlaying?.youtubeVideoId ?? null,
    onEnded: handleEnded,
    onError: handleError,
  });

  const handleSkip = useCallback(() => {
    stop();        // halt audio immediately for instant feedback
    handleEnded(); // tell the server to advance the queue
  }, [stop, handleEnded]);

  return (
    <div className="space-y-4">
      <CreatorControls />

      {/* Hidden YouTube player — provides background audio, no video displayed */}
      <YoutubePlayer />

      {skipError && (
        <p className="text-center text-red-400 text-xs">{skipError}</p>
      )}

      <SearchPanel tokensRemaining={null} onSongAdded={refetch} />

      <QueueDisplay
        nowPlaying={nowPlaying}
        upcomingEntries={upcomingEntries}
        isLoading={isLoading}
        onRefetch={refetch}
        onSkip={handleSkip}
        isMuted={muted}
        onUnmute={unmute}
      />
    </div>
  );
}
