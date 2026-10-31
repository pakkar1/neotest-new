import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppConfig, SessionUser } from '../shared/types';
import { apiRequest, getToken, onUnauthorized, setToken, ApiClientError } from './api';

interface AuthState {
  status: 'loading' | 'ready' | 'error';
  user: SessionUser | null;
  config: AppConfig | null;
  error: string | null;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  loginWithFirebase: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface SessionResponse {
  user: SessionUser;
  mode: 'demo' | 'firebase';
  token: string;
  expiresAt?: string;
}

async function firebaseSignIn(config: AppConfig, email: string, password: string): Promise<string> {
  if (!config.firebase || !config.firebase.apiKey) {
    throw new ApiClientError(
      'Konfigurasi Firebase Web belum diisi di server. Hubungi administrator.',
      'CONFIGURATION_ERROR',
      500,
    );
  }
  const [{ initializeApp, getApps }, authModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(config.firebase);
  const auth = authModule.getAuth(app);
  const credential = await authModule.signInWithEmailAndPassword(auth, email, password);
  const idToken = await credential.user.getIdToken();
  return idToken;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await apiRequest<AppConfig>('/api/config');
      setConfig(cfg);
      return cfg;
    } catch {
      setConfig(null);
      return null;
    }
  }, []);

  const reloadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const res = await apiRequest<{ user: SessionUser }>('/api/auth', {
        query: { action: 'me' },
      });
      setUser(res.user);
    } catch (err) {
      setToken(null);
      setUser(null);
      if (err instanceof ApiClientError && err.status !== 401) {
        setError(err.message);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadConfig();
      if (!active) return;
      await reloadUser();
      if (!active) return;
      setStatus('ready');
    })();
    onUnauthorized(() => {
      setUser(null);
      setToken(null);
    });
    return () => {
      active = false;
      onUnauthorized(null);
    };
  }, [loadConfig, reloadUser]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await apiRequest<SessionResponse>('/api/auth', {
      method: 'POST',
      query: { action: 'login' },
      body: { email: identifier, password },
    });
    setToken(res.token);
    setUser(res.user);
    setError(null);
    return res.user;
  }, []);

  const loginWithFirebase = useCallback(
    async (email: string, password: string) => {
      let cfg = config;
      if (!cfg) cfg = await loadConfig();
      if (!cfg) throw new ApiClientError('Konfigurasi aplikasi tidak tersedia.', 'CONFIGURATION_ERROR', 500);
      const idToken = await firebaseSignIn(cfg, email, password);
      const res = await apiRequest<SessionResponse>('/api/auth', {
        method: 'POST',
        query: { action: 'session' },
        body: { idToken },
      });
      setToken(res.token);
      setUser(res.user);
      setError(null);
      return res.user;
    },
    [config, loadConfig],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth', { method: 'POST', query: { action: 'logout' } });
    } catch {
      // sesi mungkin sudah kedaluwarsa
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      config,
      error,
      login,
      loginWithFirebase,
      logout,
      refreshConfig: async () => {
        await loadConfig();
      },
      reloadUser,
    }),
    [status, user, config, error, login, loginWithFirebase, logout, loadConfig, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}

export function useCurrentUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('Pengguna belum masuk');
  return user;
}
