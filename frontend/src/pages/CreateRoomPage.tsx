import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

interface CreateRoomResponse {
  roomCode: string;
}

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const { isAuthenticated, youtubeEmail, loading } = useAuth();
  const { post } = useApi();

  const [displayName, setDisplayName] = useState<string>('');
  const [tokenAllowance, setTokenAllowance] = useState<number>(5);
  const [tokenRefreshIntervalMinutes, setTokenRefreshIntervalMinutes] = useState<number>(30);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-12 text-center space-y-4">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await post<CreateRoomResponse>('/api/rooms', {
        displayName: displayName.trim(),
        tokenAllowance: Number(tokenAllowance),
        tokenRefreshIntervalMinutes: Number(tokenRefreshIntervalMinutes),
      });
      navigate(`/room/${data.roomCode}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to create room. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto mt-12">
        <h1 className="text-3xl font-bold mb-1">Create a Room</h1>
        {youtubeEmail && (
          <p className="text-green-400 text-sm mb-6">
            Authenticated as <span className="font-medium">{youtubeEmail}</span>
          </p>
        )}
        <p className="text-gray-400 mb-8">Configure your music room settings.</p>

        <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-6">
          {error && <ErrorMessage message={error} />}

          <div className="space-y-2">
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">
              Your Display Name
            </label>
            <input
              id="displayName"
              type="text"
              maxLength={30}
              value={displayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              placeholder="e.g. DJ Gergo"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-gray-400"
              required
            />
            <p className="text-gray-500 text-xs">How guests will see you in the room (1–30 characters).</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="tokenAllowance" className="block text-sm font-medium text-gray-300">
              Token Allowance per Guest
            </label>
            <input
              id="tokenAllowance"
              type="number"
              min={1}
              max={20}
              value={tokenAllowance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTokenAllowance(Number(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-400"
            />
            <p className="text-gray-500 text-xs">How many song requests each guest starts with (1–20).</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="tokenRefresh" className="block text-sm font-medium text-gray-300">
              Token Refresh Interval
            </label>
            <select
              id="tokenRefresh"
              value={tokenRefreshIntervalMinutes}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTokenRefreshIntervalMinutes(Number(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-400"
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every 60 minutes</option>
            </select>
            <p className="text-gray-500 text-xs">How often guests receive a new token.</p>
          </div>

          <button
            type="submit"
            disabled={submitting || !displayName.trim()}
            className="w-full bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Room'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
