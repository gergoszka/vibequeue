import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface AuthUrlResponse {
  url: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { get } = useApi();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [hostLoading, setHostLoading] = useState<boolean>(false);
  const [hostError, setHostError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState<string>('');

  async function handleStartAsHost(): Promise<void> {
    // Already authenticated — go straight to create, no OAuth round-trip needed.
    if (isAuthenticated) {
      navigate('/room/create');
      return;
    }

    setHostLoading(true);
    setHostError(null);
    try {
      const data = await get<AuthUrlResponse>('/api/auth/youtube/url');
      window.location.href = data.url;
    } catch (err) {
      setHostError((err as Error).message || 'Failed to start authentication. Please try again.');
      setHostLoading(false);
    }
  }

  function handleJoin(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  }

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight">VibeQueue</h1>
        <p className="text-gray-400 text-lg">Create or join a music room</p>

        <div className="flex flex-col gap-6 mt-4 w-full max-w-xl md:grid md:grid-cols-2 md:gap-6">
          {/* Host panel */}
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col items-center gap-4">
            <h2 className="text-lg font-semibold text-white">I&apos;m a Host</h2>
            <p className="text-gray-400 text-sm">
              {isAuthenticated
                ? 'You\'re signed in and ready to go.'
                : 'Connect your YouTube account to start a room.'}
            </p>
            {hostError && (
              <p className="text-red-400 text-sm">{hostError}</p>
            )}
            <button
              onClick={handleStartAsHost}
              disabled={hostLoading || authLoading}
              className="w-full min-h-[44px] bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {authLoading ? <LoadingSpinner /> : hostLoading ? 'Redirecting...' : 'Start a Room'}
            </button>
          </div>

          {/* Guest panel */}
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col items-center gap-4">
            <h2 className="text-lg font-semibold text-white">I&apos;m a Guest</h2>
            <p className="text-gray-400 text-sm">Enter a room code to join.</p>
            <form onSubmit={handleJoin} className="w-full flex flex-col gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={8}
                className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-base placeholder-gray-500 focus:outline-none focus:border-gray-400 uppercase tracking-widest w-full"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="w-full min-h-[44px] border border-gray-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
