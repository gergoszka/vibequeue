import { useRoom } from '../contexts/RoomContext';
import QueueDisplay from './QueueDisplay';
import SearchPanel from './SearchPanel';
import TokenStatus from './TokenStatus';

const GuestRoomView: React.FC = () => {
  const { room, guest, nowPlaying, upcomingEntries, queueLoading: isLoading, refetchQueue: refetch, tokensRemaining } = useRoom();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Room: {room?.code}</h2>
        <span className="text-xs text-gray-400">{guest?.displayName}</span>
      </div>

      <TokenStatus />

      {/* Search */}
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
  );
};

export default GuestRoomView;
