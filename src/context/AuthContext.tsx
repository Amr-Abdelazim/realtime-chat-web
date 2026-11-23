import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, refreshAccessToken, setAccessToken, setTokenListener } from '../lib/api';
import type { User } from '../types';

type RegisterInput = { email: string; username: string; password: string; displayName: string };
type LoginInput = { email: string; password: string };

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: { displayName?: string; avatarUrl?: string | null }) => Promise<void>;
  refresh: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTokenListener(setTokenState);
    return () => setTokenListener(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      return await refreshAccessToken();
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!loading && user && !accessToken) setUser(null);
  }, [accessToken, loading, user]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refreshAccessToken();
        const currentUser = await api.me();
        if (alive) setUser(currentUser);
      } catch {
        setAccessToken(null);
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The access token is short-lived. Rotate it before the documented 15-minute
  // default expiry so an idle socket does not remain authenticated with a stale JWT.
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      refreshAccessToken().catch(() => {
        setAccessToken(null);
        setUser(null);
      });
    }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [user]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.login(input);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.register(input);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (input: { displayName?: string; avatarUrl?: string | null }) => {
    const updated = await api.updateMe(input);
    setUser(updated);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accessToken,
    loading,
    login,
    register,
    logout,
    updateProfile,
    refresh,
  }), [user, accessToken, loading, login, register, logout, updateProfile, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
