import { useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useLongPress } from '../hooks/useLongPress';
import QueueDisplay from './QueueDisplay';
import SearchPanel from './SearchPanel';
import TokenStatus from './TokenStatus';
import PlaylistBrowser from './PlaylistBrowser';
import RoomMembersList from './RoomMembersList';
import type { RoomMember } from '../hooks/useWebSocket';

interface GuestRoomViewProps {
  wsMembers: RoomMember[];
}

const GuestRoomView: React.FC<GuestRoomViewProps> = ({ wsMembers }) => {
  const { room, guest, nowPlaying, upcomingEntries, queueLoading: isLoading, refetchQueue: refetch, tokensRemaining, refreshTokenStatus } = useRoom();
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const roomCodeLongPress = useLongPress(() => { if (window.innerWidth < 1024) setShowTooltip(true); });

  return (
    <div className="flex gap-4 min-h-[calc(100vh-8rem)]">
      {/* Left sidebar — Playlist browser */}
      <div className="hidden lg:flex lg:flex-col w-72 flex-shrink-0">
        <PlaylistBrowser
          roomCode={room?.code ?? ''}
          tokensRemaining={tokensRemaining}
          onSongAdded={refetch}
          refreshTokenStatus={refreshTokenStatus}
        />
      </div>

      {/* Center — main content */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative">
            <h2 className="text-lg font-semibold text-white">
              <span className="select-none" {...roomCodeLongPress}>Room</span>
              <span>: {room?.code}</span>
            </h2>
            {showTooltip && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTooltip(false)} />
                <div className="absolute top-full left-0 mt-2 z-20 bg-gray-700 border border-gray-600 rounded-lg shadow-xl p-3 min-w-[180px]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">In this room</p>
                  {wsMembers.length === 0 ? (
                    <p className="text-xs text-gray-500">No members yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {wsMembers.map(m => (
                        <div key={m.userId} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          <span className="text-sm text-white truncate">{m.displayName}</span>
                          {m.role === 'host' && <span className="text-xs text-gray-500 ml-auto">host</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <span className="text-xs text-gray-400">{guest?.displayName}</span>
        </div>

        <TokenStatus />

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
              <PlaylistBrowser
                roomCode={room?.code ?? ''}
                tokensRemaining={tokensRemaining}
                onSongAdded={refetch}
                refreshTokenStatus={refreshTokenStatus}
              />
            </div>
          )}
        </div>

        <SearchPanel
          tokensRemaining={tokensRemaining}
          onSongAdded={refetch}
        />

        {/* Queue — guests see the queue but cannot remove entries */}
        <QueueDisplay
          nowPlaying={nowPlaying}
          upcomingEntries={upcomingEntries}
          isLoading={isLoading}
          onRefetch={refetch}
        />
      </div>

      {/* Right sidebar — Members list */}
      <div className="hidden lg:flex lg:flex-col w-56 flex-shrink-0">
        <RoomMembersList roomCode={room?.code ?? ''} members={wsMembers} />
      </div>
    </div>

  );
};

export default GuestRoomView;
