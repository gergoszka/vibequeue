import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
  wide?: boolean;
}

export default function Layout({ children, wide = false }: LayoutProps) {
  const { isAuthenticated, youtubeEmail, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="w-full flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-white hover:text-gray-200 transition-colors">PeresParty</Link>
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
        <div className={wide ? 'w-full' : 'max-w-2xl mx-auto'}>
          {children}
        </div>
      </main>
      <footer className="border-t border-gray-800 py-4 px-6 text-center">
        <a href="/privacy" className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
          Privacy Policy
        </a>
      </footer>
    </div>
  );
}
