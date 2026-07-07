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
}

export default function QueueDisplay({ nowPlaying, upcomingEntries, isLoading, onRefetch, onSkip, isMuted, onUnmute }: QueueDisplayProps) {
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
          />

          {/* Host controls */}
          {isCreator && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
              {/* Audio enable — only shown while muted (initial autoplay state) */}
              {isMuted && (
                <button
                  onClick={onUnmute}
                  className="text-xs px-2 py-1 rounded border border-yellow-500/40 text-yellow-400 hover:border-yellow-400 transition"
                  title="Enable audio"
                >
                  🔇 Enable audio
                </button>
              )}
              {!isMuted && isMuted !== undefined && (
                <span className="text-xs text-green-400">🔊 Playing</span>
              )}

              <button
                onClick={onSkip}
                className="ml-auto text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition"
                title="Skip to next song"
              >
                ⏭ Skip
              </button>
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
              onRemove={isCreator ? handleRemove : undefined}
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
