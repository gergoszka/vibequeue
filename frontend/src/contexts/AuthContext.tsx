import { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE } from '../config';

interface AuthContextValue {
  isAuthenticated: boolean;
  youtubeEmail: string | null;
  loading: boolean;
  checkAuthStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [youtubeEmail, setYoutubeEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  async function checkAuthStatus(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' });
      const data = await res.json() as { authenticated: boolean; email?: string };
      setIsAuthenticated(data.authenticated);
      setYoutubeEmail(data.email ?? null);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setIsAuthenticated(false);
      setYoutubeEmail(null);
    }
  }

  useEffect(() => { checkAuthStatus(); }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, youtubeEmail, loading, checkAuthStatus, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
