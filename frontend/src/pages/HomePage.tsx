import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface AuthUrlResponse {
  url: string;
}

interface RoomSummary {
  code: string;
  role: 'host' | 'guest';
}

export default function HomePage() {
  const navigate = useNavigate();
  const { get } = useApi();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setRoomsLoading(true);
    get<{ rooms: RoomSummary[] }>('/api/rooms/mine')
      .then((data) => setRooms(data.rooms))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(): Promise<void> {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const data = await get<AuthUrlResponse>(
        `/api/auth/youtube/url?redirectUri=${encodeURIComponent(redirectUri)}`
      );
      window.location.href = data.url;
    } catch (err) {
      setLoginError((err as Error).message || 'Failed to start authentication.');
      setLoginLoading(false);
    }
  }

  function handleJoin(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  }

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 py-10">
          <div className="text-center">
            <h1 className="text-6xl font-bold tracking-tight">PeresParty</h1>
            <p className="text-gray-400 text-xl mt-3">Collaborative music queue for your party</p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
            {/* Host card */}
            <div className="flex-1 flex flex-col gap-5 bg-gray-800/50 border border-gray-700 rounded-2xl px-7 py-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">For hosts</p>
                <p className="text-white font-bold text-lg">Start a room</p>
                <p className="text-gray-400 text-sm mt-1">Connect your YouTube account. Your browser plays the music — guests add songs to the queue.</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm text-gray-400">
                <li className="flex items-center gap-2"><span>🎵</span> Play music from your YouTube library</li>
                <li className="flex items-center gap-2"><span>👑</span> Control the queue and skip songs</li>
                <li className="flex items-center gap-2"><span>🔒</span> Read-only access — nothing stored after session</li>
              </ul>
              <div className="mt-auto pt-2 flex flex-col gap-2">
                {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
                <button
                  onClick={handleLogin}
                  disabled={loginLoading}
                  className="min-h-[44px] w-full bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loginLoading ? <LoadingSpinner /> : 'Sign in with YouTube'}
                </button>
              </div>
            </div>

            {/* Guest card */}
            <div className="flex-1 flex flex-col gap-5 bg-gray-800/50 border border-gray-700 rounded-2xl px-7 py-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">For guests</p>
                <p className="text-white font-bold text-lg">Join a room</p>
                <p className="text-gray-400 text-sm mt-1">Got a room code? Jump straight in, sign in with YouTube, and start adding songs.</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm text-gray-400">
                <li className="flex items-center gap-2"><span>🎶</span> Queue songs using your token allowance</li>
                <li className="flex items-center gap-2"><span>🔍</span> Search YouTube to find any song</li>
                <li className="flex items-center gap-2"><span>📱</span> Works on any device, no app needed</li>
              </ul>
              <form onSubmit={handleJoin} className="mt-auto pt-2 flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setJoinCode(e.target.value.toUpperCase())
                  }
                  placeholder="Room code"
                  maxLength={8}
                  className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-400 uppercase tracking-widest text-sm"
                />
                <button
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="min-h-[44px] border border-gray-600 text-white font-semibold px-5 py-3 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-8 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-6">PeresParty</h1>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate('/room/create')}
              className="min-h-[44px] bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Create Room
            </button>

            <form onSubmit={handleJoin} className="flex flex-1 gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setJoinCode(e.target.value.toUpperCase())
                }
                placeholder="Room code"
                maxLength={8}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 uppercase tracking-widest"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="min-h-[44px] border border-gray-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Active rooms */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Your active rooms
          </h2>

          {roomsLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner />
            </div>
          ) : rooms.length === 0 ? (
            <p className="text-gray-500 text-sm">No active rooms.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rooms.map((room) => (
                <li
                  key={room.code}
                  className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-5 py-4"
                >
                  <div>
                    <span className="text-white font-mono font-semibold tracking-widest text-lg">
                      {room.code}
                    </span>
                    <span className="ml-3 text-xs text-gray-400 uppercase tracking-wider">
                      {room.role}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/room/${room.code}`)}
                    className="text-sm border border-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
