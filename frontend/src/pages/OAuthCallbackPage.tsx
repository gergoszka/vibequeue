import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuthStatus } = useAuth();
  const { post } = useApi();
  const [error, setError] = useState<string | null>(null);
  const didRun = useRef<boolean>(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code received.');
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    // Determine where to send the user after login.
    // guest intent → go to the specific room; everything else → home (shows their rooms).
    let redirectTo = '/';
    const stateParam = searchParams.get('state');
    if (stateParam) {
      try {
        const parsed = JSON.parse(stateParam) as { roomCode?: string; intent?: string };
        if (parsed.intent === 'guest' && parsed.roomCode) {
          redirectTo = `/room/${parsed.roomCode}`;
        }
      } catch { /* ignore malformed state */ }
    }

    post<unknown>('/api/auth/youtube/callback', { code, redirectUri })
      .then(async () => {
        await checkAuthStatus();
        navigate(redirectTo, { replace: true });
      })
      .catch((err: Error) => {
        setError(err.message || 'Authentication failed. Please try again.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-12 text-center space-y-4">
          <ErrorMessage message={error} />
          <a href="/" className="text-blue-400 hover:underline">Try again</a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <LoadingSpinner />
        <p className="text-gray-300">Connecting to YouTube...</p>
      </div>
    </Layout>
  );
}
