import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../contexts/AuthContext';

interface Playlist {
  playlistId: string;
  title: string;
  thumbnailUrl: string | null;
  itemCount: number;
  isLikedSongs?: boolean;
}

interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
}

interface PlaylistBrowserProps {
  roomCode: string;
  tokensRemaining: number | null;
  onSongAdded: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistBrowser({ roomCode, tokensRemaining, onSongAdded }: PlaylistBrowserProps) {
  const { logout } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [nextPlaylistPageToken, setNextPlaylistPageToken] = useState<string | undefined>();
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [nextItemPageToken, setNextItemPageToken] = useState<string | undefined>();
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const addingRef = useRef(false);

  const hasTokens = tokensRemaining === null || tokensRemaining > 0;

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    try {
      await logout();
      const redirectUri = `${window.location.origin}/auth/callback`;
      const state = JSON.stringify({ guestIntent: false, returnTo: window.location.pathname });
      const res = await fetch(
        `${API_BASE}/api/auth/youtube/url?redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
        { credentials: 'include' }
      );
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      setReconnecting(false);
    }
  }, [logout]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/youtube/playlists`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 401) {
            setPlaylistError('Sign in with YouTube to browse playlists.');
          } else if (res.status === 403) {
            const body = await res.json() as { code?: string };
            if (body.code === 'scope_error') {
              setNeedsReauth(true);
            } else {
              setPlaylistError('Could not load playlists.');
            }
          } else {
            setPlaylistError('Could not load playlists.');
          }
          return;
        }
        const data = await res.json() as { playlists: Playlist[]; nextPageToken?: string };
        setPlaylists(data.playlists);
        setNextPlaylistPageToken(data.nextPageToken);
      } catch {
        setPlaylistError('Could not load playlists.');
      } finally {
        setLoadingPlaylists(false);
      }
    })();
  }, []);

  const loadMorePlaylists = useCallback(async () => {
    if (!nextPlaylistPageToken) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/youtube/playlists?pageToken=${encodeURIComponent(nextPlaylistPageToken)}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = await res.json() as { playlists: Playlist[]; nextPageToken?: string };
      setPlaylists((prev) => [...prev, ...data.playlists]);
      setNextPlaylistPageToken(data.nextPageToken);
    } catch {
      // ignore
    }
  }, [nextPlaylistPageToken]);

  const openPlaylist = useCallback(async (playlist: Playlist) => {
    if (selectedPlaylist?.playlistId === playlist.playlistId) {
      setSelectedPlaylist(null);
      setItems([]);
      return;
    }
    setSelectedPlaylist(playlist);
    setItems([]);
    setNextItemPageToken(undefined);
    setItemError(null);
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (playlist.isLikedSongs) params.set('musicOnly', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(
        `${API_BASE}/api/youtube/playlists/${playlist.playlistId}/items${qs}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        setItemError('Could not load playlist items.');
        return;
      }
      const data = await res.json() as { items: PlaylistItem[]; nextPageToken?: string };
      setItems(data.items);
      setNextItemPageToken(data.nextPageToken);
    } catch {
      setItemError('Could not load playlist items.');
    } finally {
      setLoadingItems(false);
    }
  }, [selectedPlaylist]);

  const loadMoreItems = useCallback(async () => {
    if (!selectedPlaylist || !nextItemPageToken) return;
    try {
      const params = new URLSearchParams({ pageToken: nextItemPageToken });
      if (selectedPlaylist.isLikedSongs) params.set('musicOnly', 'true');
      const res = await fetch(
        `${API_BASE}/api/youtube/playlists/${selectedPlaylist.playlistId}/items?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = await res.json() as { items: PlaylistItem[]; nextPageToken?: string };
      setItems((prev) => [...prev, ...data.items]);
      setNextItemPageToken(data.nextPageToken);
    } catch {
      // ignore
    }
  }, [selectedPlaylist, nextItemPageToken]);

  const handleAdd = useCallback(async (item: PlaylistItem) => {
    if (!hasTokens || addingRef.current) return;
    addingRef.current = true;
    setAddingId(item.videoId);
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomCode}/queue`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtubeVideoId: item.videoId,
          title: item.title,
          thumbnailUrl: item.thumbnailUrl,
          durationSeconds: item.durationSeconds || undefined,
        }),
      });
      if (res.ok) {
        setAddedIds((prev) => new Set([...prev, item.videoId]));
        setTimeout(() => setAddedIds((prev) => { const n = new Set(prev); n.delete(item.videoId); return n; }), 2000);
        onSongAdded();
      }
    } catch {
      // ignore
    } finally {
      addingRef.current = false;
      setAddingId(null);
    }
  }, [roomCode, hasTokens, onSongAdded]);

  return (
    <div className="bg-gray-800 rounded-lg flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-gray-700 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Your Playlists
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loadingPlaylists && (
          <p className="text-gray-500 text-xs text-center py-6">Loading playlists...</p>
        )}

        {needsReauth && !loadingPlaylists && (
          <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
            <p className="text-gray-400 text-xs">YouTube permissions need to be renewed.</p>
            <button
              onClick={() => void handleReconnect()}
              disabled={reconnecting}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {reconnecting ? 'Redirecting…' : 'Reconnect YouTube'}
            </button>
          </div>
        )}

        {playlistError && !loadingPlaylists && !needsReauth && (
          <p className="text-gray-500 text-xs text-center py-6 px-4">{playlistError}</p>
        )}

        {!loadingPlaylists && !playlistError && playlists.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-6">No playlists found.</p>
        )}

        {!loadingPlaylists && !playlistError && playlists.length > 0 && (
          <div>
            {playlists.map((playlist) => (
              <div key={playlist.playlistId}>
                {/* Playlist header row */}
                <button
                  onClick={() => void openPlaylist(playlist)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"
                >
                  {playlist.thumbnailUrl ? (
                    <img
                      src={playlist.thumbnailUrl}
                      alt=""
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded flex-shrink-0 flex items-center justify-center ${playlist.title === 'Liked Songs' ? 'bg-red-900' : 'bg-gray-600'}`}>
                      <span className="text-sm">{playlist.title === 'Liked Songs' ? '♥' : '♪'}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{playlist.title}</p>
                    <p className="text-xs text-gray-500">{playlist.itemCount} songs</p>
                  </div>
                  <span className="text-gray-500 text-xs ml-1 flex-shrink-0">
                    {selectedPlaylist?.playlistId === playlist.playlistId ? '▲' : '▼'}
                  </span>
                </button>

                {/* Expanded items */}
                {selectedPlaylist?.playlistId === playlist.playlistId && (
                  <div className="bg-gray-750 border-t border-gray-700 max-h-72 overflow-y-auto">
                    {loadingItems && (
                      <p className="text-gray-500 text-xs text-center py-4">Loading...</p>
                    )}
                    {itemError && (
                      <p className="text-red-400 text-xs text-center py-4">{itemError}</p>
                    )}
                    {!loadingItems && items.map((item) => (
                      <div
                        key={item.videoId}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-700 transition-colors"
                      >
                        {item.thumbnailUrl && (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate">{item.title}</p>
                          {item.durationSeconds > 0 && (
                            <p className="text-xs text-gray-500">{formatDuration(item.durationSeconds)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => void handleAdd(item)}
                          disabled={!hasTokens || addingId === item.videoId || addedIds.has(item.videoId)}
                          className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            addedIds.has(item.videoId)
                              ? 'bg-green-700 text-green-200 cursor-default'
                              : !hasTokens
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : addingId === item.videoId
                              ? 'bg-blue-800 text-blue-300 cursor-wait'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          {addedIds.has(item.videoId)
                            ? 'Added'
                            : addingId === item.videoId
                            ? '...'
                            : '+'}
                        </button>
                      </div>
                    ))}
                    {!loadingItems && nextItemPageToken && (
                      <button
                        onClick={() => void loadMoreItems()}
                        className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Load more
                      </button>
                    )}
                    {!loadingItems && !itemError && items.length === 0 && (
                      <p className="text-gray-500 text-xs text-center py-4">No items found.</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {nextPlaylistPageToken && (
              <button
                onClick={() => void loadMorePlaylists()}
                className="w-full py-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Load more playlists
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
