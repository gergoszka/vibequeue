import { useEffect, useState, useCallback } from 'react';
import YoutubePlayer, { PLAYER_CONTAINER_ID } from './YoutubePlayer';
import { useRoom } from '../contexts/RoomContext';
import { useYoutubePlayer } from '../hooks/useYoutubePlayer';
import QueueDisplay from './QueueDisplay';
import SearchPanel from './SearchPanel';
import CreatorControls from './CreatorControls';
import PlaylistBrowser from './PlaylistBrowser';
import RoomMembersList from './RoomMembersList';
import { API_BASE } from '../config';
import type { RoomMember } from '../hooks/useWebSocket';

interface CreatorRoomViewProps {
  wsMembers: RoomMember[];
}

export default function CreatorRoomView({ wsMembers }: CreatorRoomViewProps) {
  const { room, nowPlaying, upcomingEntries, queueLoading: isLoading, refetchQueue: refetch } = useRoom();
  const [advancing, setAdvancing] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);

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
  }, [room?.code]);

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

  const { muted, paused, unmute, stop, togglePause } = useYoutubePlayer({
    containerId: PLAYER_CONTAINER_ID,
    videoId: nowPlaying?.youtubeVideoId ?? null,
    trackTitle: nowPlaying?.title,
    trackThumbnailUrl: nowPlaying?.thumbnailUrl,
    onEnded: handleEnded,
    onError: handleError,
  });

  const handleSkip = useCallback(() => {
    stop();        // halt audio immediately for instant feedback
    handleEnded(); // tell the server to advance the queue
  }, [stop, handleEnded]);

  return (
    <div className="flex gap-4 min-h-[calc(100vh-8rem)]">
      {/* Left sidebar — Playlist browser */}
      <div className="hidden lg:flex lg:flex-col w-72 flex-shrink-0">
        <PlaylistBrowser roomCode={room?.code ?? ''} tokensRemaining={null} onSongAdded={refetch} />
      </div>

      {/* Center — main content */}
      <div className="flex-1 min-w-0 space-y-4">
        <CreatorControls members={wsMembers} />

        {/* Hidden YouTube player — provides background audio, no video displayed */}
        <YoutubePlayer />

        {skipError && (
          <p className="text-center text-red-400 text-xs">{skipError}</p>
        )}

        {/* Mobile playlist — collapsible, above search */}
        <div className="lg:hidden">
          <button
            onClick={() => setPlaylistOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 rounded-lg text-white text-sm font-medium"
          >
            <span>Playlists</span>
            <span>{playlistOpen ? '▲' : '▼'}</span>
          </button>
          {playlistOpen && (
            <div className="mt-2">
              <PlaylistBrowser roomCode={room?.code ?? ''} tokensRemaining={null} onSongAdded={refetch} />
            </div>
          )}
        </div>

        <SearchPanel tokensRemaining={null} onSongAdded={refetch} />

        <QueueDisplay
          nowPlaying={nowPlaying}
          upcomingEntries={upcomingEntries}
          isLoading={isLoading}
          onRefetch={refetch}
          onSkip={handleSkip}
          isMuted={muted}
          onUnmute={unmute}
          isPaused={paused}
          onTogglePause={togglePause}
        />
      </div>

      {/* Right sidebar — Members list */}
      <div className="hidden lg:flex lg:flex-col w-56 flex-shrink-0">
        <RoomMembersList roomCode={room?.code ?? ''} members={wsMembers} />
      </div>
    </div>

  );
}
