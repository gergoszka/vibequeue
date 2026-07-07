import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

interface GuestAuthPromptProps {
  roomCode: string;
}

interface AuthUrlResponse {
  url: string;
}

export default function GuestAuthPrompt({ roomCode }: GuestAuthPromptProps) {
  const { get } = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const state = JSON.stringify({ roomCode, intent: 'guest' });
      const data = await get<AuthUrlResponse>(
        `/api/auth/youtube/url?redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
      );
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message || 'Failed to start sign-in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12 space-y-6 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">Join Room {roomCode}</h2>
        <p className="text-gray-400 text-sm">
          Sign in with YouTube to search and add songs to the queue.
        </p>
      </div>

      {error && <ErrorMessage message={error} />}

      <button
        onClick={handleSignIn}
        disabled={loading}
        className="w-full min-h-[44px] bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? <LoadingSpinner /> : 'Sign in with YouTube'}
      </button>
    </div>
  );
}
