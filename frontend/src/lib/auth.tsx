import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  clearToken,
  getToken,
  setToken,
  SESSION_EXPIRED_EVENT,
} from './api';
import { setDemoMode, isDemoMode } from './demo/state';
import type { AuthUser } from './types';

const REFRESH_KEY = 'p2p_refresh';

export interface DemoUser {
  username: string;
  name: string;
  profile: string;
  description: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  acknowledgeSessionExpired: () => void;
  login: (username: string, password: string) => Promise<void>;
  loginDemo: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Sinal global de sessão expirada (emitido pelo interceptor de 401 do api.ts).
  // O <RequireAuth /> redireciona com useNavigate quando este flag liga.
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  // Ao carregar: se há token, recupera o usuário.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post<{
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', { username, password });
    setToken(data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me.data);
    setSessionExpired(false);
  }, []);

  /**
   * Login do Modo Demonstração — 100% local. Ativa o flag de demo (que
   * faz o axios adapter interceptar todas as chamadas e devolver dados
   * mockados de localStorage). Não envia request real ao backend.
   */
  const loginDemo = useCallback(async (username: string) => {
    setDemoMode(true);
    // /auth/demo-login agora é interceptado pelo demo adapter (handlers.ts).
    const { data } = await api.post<{
      accessToken: string;
      refreshToken: string;
    }>('/auth/demo-login', { username });
    setToken(data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me.data);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: avisa o backend para apagar os cookies httpOnly. Se o
    // endpoint não estiver pronto (HML), seguimos com a limpeza local.
    try {
      await api.post('/auth/logout', {});
    } catch {
      /* noop */
    }
    clearToken();
    localStorage.removeItem(REFRESH_KEY);
    // Em modo demo, desliga também o flag — próximas chamadas voltariam ao
    // backend real (que não está acessível aqui — mas é o comportamento certo).
    if (isDemoMode()) setDemoMode(false);
    setUser(null);
  }, []);

  const acknowledgeSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionExpired,
        acknowledgeSessionExpired,
        login,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
