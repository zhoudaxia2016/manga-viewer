import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, apiUrl } from '@/lib/apiClient';

export type ApiAuthState = {
  ready: boolean;
  authRequired: boolean;
  authenticated: boolean;
  refresh: () => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const ApiAuthContext = createContext<ApiAuthState | null>(null);

export function ApiAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(apiUrl('/api/auth/me'));
      if (!res.ok) {
        setAuthRequired(false);
        setAuthenticated(true);
        setReady(true);
        return;
      }
      const j = (await res.json()) as { authRequired?: boolean; authenticated?: boolean };
      setAuthRequired(!!j.authRequired);
      setAuthenticated(!!j.authenticated);
    } catch {
      setAuthRequired(false);
      setAuthenticated(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (password: string) => {
      const res = await apiFetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        throw new Error(j.message || j.error || '登录失败');
      }
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    } catch {
      /* ignore */
    }
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ready,
      authRequired,
      authenticated,
      refresh,
      login,
      logout,
    }),
    [ready, authRequired, authenticated, refresh, login, logout],
  );

  return <ApiAuthContext.Provider value={value}>{children}</ApiAuthContext.Provider>;
}

export function useApiAuth(): ApiAuthState {
  const ctx = useContext(ApiAuthContext);
  if (!ctx) throw new Error('useApiAuth must be used within ApiAuthProvider');
  return ctx;
}
