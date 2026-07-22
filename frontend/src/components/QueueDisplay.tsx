import { useRoom } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';
import QueueEntryComponent from './QueueEntry';
import SongProgressBar from './SongProgressBar';
import type { QueueEntry } from '../types';

interface QueueDisplayProps {
  nowPlaying: QueueEntry | null;
  upcomingEntries: QueueEntry[];
  isLoading: boolean;
  onRefetch: () => void;
  /** Creator-only: skip (advance) the current song */
  onSkip?: () => void;
  /** Creator-only: whether the audio player is currently muted */
  isMuted?: boolean;
  /** Creator-only: unmute the audio player */
  onUnmute?: () => void;
  /** Creator-only: whether the audio player is currently paused */
  isPaused?: boolean;
  /** Creator-only: toggle pause/resume */
  onTogglePause?: () => void;
}

export default function QueueDisplay({ nowPlaying, upcomingEntries, isLoading, onRefetch, onSkip, isMuted, onUnmute, isPaused, onTogglePause }: QueueDisplayProps) {
  const { room, isCreator } = useRoom();
  const { del } = useApi();

  const handleRemove = async (entryId: string) => {
    // Call the API and trigger a refetch — optimistic removal is deferred to ticket #17 (WS sync)
    try {
      await del(`/api/rooms/${room?.code}/queue/${entryId}`);
      onRefetch();
    } catch (err) {
      console.error('Remove failed:', (err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const isEmpty = !nowPlaying && upcomingEntries.length === 0;

  return (
    <div className="space-y-4">
      {/* Now Playing section */}
      {nowPlaying && (
        <div className="bg-gray-800 border border-green-700 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex gap-0.5 items-end h-4">
              {/* Equalizer animation */}
              <span className="w-1 bg-green-400 rounded-full animate-bounce" style={{ height: '60%', animationDelay: '0ms' }} />
              <span className="w-1 bg-green-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: '150ms' }} />
              <span className="w-1 bg-green-400 rounded-full animate-bounce" style={{ height: '40%', animationDelay: '300ms' }} />
            </span>
            <span className="text-green-400 text-xs font-semibold uppercase tracking-wide">Now Playing</span>
          </div>
          <div className="flex items-center gap-3">
            <img
              src={nowPlaying.thumbnailUrl ?? 'https://via.placeholder.com/120x68/374151/9CA3AF?text=♪'}
              alt={nowPlaying.title}
              className="w-24 h-14 object-cover rounded"
            />
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{nowPlaying.title}</p>
              <p className="text-gray-400 text-sm">Added by {nowPlaying.addedByDisplayName}</p>
            </div>
          </div>

          <SongProgressBar
            startedPlayingAt={nowPlaying.startedPlayingAt}
            durationSeconds={nowPlaying.durationSeconds}
            isPaused={isPaused}
          />

          {/* Host controls */}
          {isCreator && (
            <div className="flex items-center mt-3 pt-3 border-t border-gray-700">
              {/* Left — audio status */}
              <div className="flex-1">
                {isMuted && (
                  <button
                    onClick={onUnmute}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/50 text-white transition-all duration-150 shadow-md hover:shadow-white/10 hover:scale-105 active:scale-95"
                    title="Enable audio"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A6.97 6.97 0 0 1 14 18.98v2.06A8.99 8.99 0 0 0 17.73 19l2 2L21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
                    </svg>
                  </button>
                )}
                {!isMuted && isMuted !== undefined && (
                  <div className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-green-400">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Center — pause / resume */}
              <button
                onClick={onTogglePause}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/50 text-white transition-all duration-150 shadow-md hover:shadow-white/10 hover:scale-105 active:scale-95"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 translate-x-px">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                )}
              </button>

              {/* Right — skip */}
              <div className="flex-1 flex justify-end">
                <button
                  onClick={onSkip}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/50 text-white transition-all duration-150 shadow-md hover:shadow-white/10 hover:scale-105 active:scale-95"
                  title="Skip to next song"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M4,18 L13,12 L4,6 Z M13,6 L13,18 L22,12 Z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming queue */}
      {upcomingEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Up Next</h3>
          {upcomingEntries.map((entry, i) => (
            <QueueEntryComponent
              key={entry.id}
              entry={entry}
              index={i + 1}
              onRemove={entry.addedByCurrentUser ? handleRemove : undefined}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-3">🎵</div>
          <p className="font-medium">Queue is empty</p>
          <p className="text-sm mt-1">Add the first song!</p>
        </div>
      )}
    </div>
  );
}
