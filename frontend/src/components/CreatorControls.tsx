import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../contexts/RoomContext';
import { useApi } from '../hooks/useApi';

export default function CreatorControls() {
  const { room } = useRoom();
  const { del, post } = useApi();
  const navigate = useNavigate();
  const [copied, setCopied] = useState<boolean>(false);
  const [ending, setEnding] = useState<boolean>(false);
  const [playlistUrl, setPlaylistUrl] = useState<string>('');
  const [loadingPlaylist, setLoadingPlaylist] = useState<boolean>(false);
  const [playlistMsg, setPlaylistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const shareUrl = `${window.location.origin}/room/${room?.code}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: show prompt with the URL
      prompt('Share this link:', shareUrl);
    }
  };

  const handleLoadPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setLoadingPlaylist(true);
    setPlaylistMsg(null);
    try {
      const data = await post<{ loaded: number }>(`/api/rooms/${room?.code}/playlist`, { playlistUrl: playlistUrl.trim() });
      setPlaylistMsg({ type: 'success', text: `✓ ${data.loaded} songs loaded from playlist` });
      setPlaylistUrl('');
    } catch (err) {
      setPlaylistMsg({ type: 'error', text: (err as Error).message || 'Failed to load playlist' });
    } finally {
      setLoadingPlaylist(false);
    }
  };

  const handleEndRoom = async () => {
    const confirmed = window.confirm('End the room? All guests will be disconnected.');
    if (!confirmed) return;

    setEnding(true);
    try {
      await del(`/api/rooms/${room?.code}`);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('End room failed:', (err as Error).message);
      setEnding(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      {/* Room code + share */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Room Code</p>
          <p className="text-3xl font-bold text-white tracking-widest">{room?.code}</p>
        </div>
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition min-h-[44px]"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      {/* Room config (read-only) */}
      <div className="flex gap-4 text-sm text-gray-400">
        <span>Token allowance: <strong className="text-white">{room?.tokenAllowance}</strong></span>
        <span>Refresh every: <strong className="text-white">{room?.tokenRefreshIntervalMinutes}m</strong></span>
      </div>

      {/* Playlist loader */}
      <div className="pt-2 border-t border-gray-700 space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Background Playlist</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="Paste YouTube playlist URL..."
            className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLoadPlaylist(); }}
          />
          <button
            onClick={() => void handleLoadPlaylist()}
            disabled={loadingPlaylist || !playlistUrl.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
          >
            {loadingPlaylist ? 'Loading...' : 'Load'}
          </button>
        </div>
        {playlistMsg && (
          <p className={`text-xs ${playlistMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {playlistMsg.text}
          </p>
        )}
      </div>

      {/* End room */}
      <div className="pt-2 border-t border-gray-700">
        <button
          onClick={handleEndRoom}
          disabled={ending}
          className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50 min-h-[44px] flex items-center"
        >
          {ending ? 'Ending room...' : 'End Room'}
        </button>
      </div>
    </div>
  );
}
