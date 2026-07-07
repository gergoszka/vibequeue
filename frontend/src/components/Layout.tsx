import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated, youtubeEmail, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight text-white">VibeQueue</span>
          {isAuthenticated && youtubeEmail && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 hidden sm:block">{youtubeEmail}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 w-full mx-auto px-4 py-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
