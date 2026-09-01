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
  getAuthMode,
  getToken,
  setToken,
  SESSION_EXPIRED_EVENT,
} from './api';
import { queryClient } from './queryClient';
import type { AuthUser } from './types';

const REFRESH_KEY = 'p2p_refresh';

/**
 * Persiste o refresh token só quando estamos no modo `bearer` (legado).
 * No modo `cookie` (default em PROD/HML) o refresh é httpOnly, então
 * gravar no localStorage só expõe o token a XSS sem benefício nenhum —
 * o /auth/refresh do backend lê do cookie sozinho.
 */
function persistRefreshToken(refreshToken: string | undefined) {
  if (getAuthMode() === 'cookie') return;
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  acknowledgeSessionExpired: () => void;
  /**
   * Os métodos de login aceitam um `turnstileToken` opcional — o backend
   * exige quando `TURNSTILE_SECRET_KEY` está configurada em PROD/HML;
   * em dev/demo o token vai vazio e o backend ignora.
   */
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  loginLocal: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Simulação de login (admin): "ver como" o usuário. Devolve o efetivo. */
  impersonate: (userId: string) => Promise<AuthUser>;
  /** Sai da simulação e volta a ser o admin. Devolve o admin. */
  exitImpersonation: () => Promise<AuthUser>;
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
      .then((res) => {
        // Defensivo: usuário sem permissão de switch nunca deve operar em
        // O ambiente (PROD/HML) é fixado no momento do login pela LoginPage
        // e fica travado durante toda a sessão. Cada env tem auth própria —
        // se o backend respondeu /auth/me com sucesso, a sessão é válida
        // aqui.
        setUser(res.data);
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (username: string, password: string, turnstileToken?: string) => {
      // Zera a cache do React Query antes de logar pra não herdar dados de
      // outro usuário/perfil (ex.: pendingApprovals do gestor vindo do operador).
      queryClient.clear();
      // O ambiente já foi definido pela LoginPage (PROD ou HML). Não força
      // PROD aqui pra respeitar a escolha do usuário no toggle.
      localStorage.removeItem('p2p_company');
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
      }>(
        '/auth/login',
        { username, password },
        // Mandamos o token via header — o backend lê dos 2 caminhos
        // (header preferido, body como fallback).
        turnstileToken
          ? { headers: { 'x-turnstile-token': turnstileToken } }
          : undefined,
      );
      setToken(data.accessToken);
      persistRefreshToken(data.refreshToken);
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me.data);
      setSessionExpired(false);
    },
    [],
  );

  /**
   * Login local — para usuários fora do AD (supervisores, vendedores).
   * `identifier` aceita e-mail corporativo ou CPF (só dígitos). O backend
   * decide pelo formato e devolve o mesmo par de tokens do login AD.
   */
  const loginLocal = useCallback(
    async (username: string, password: string, turnstileToken?: string) => {
      queryClient.clear();
      localStorage.removeItem('p2p_company');
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
      }>(
        '/auth/login-local',
        { username, password },
        turnstileToken
          ? { headers: { 'x-turnstile-token': turnstileToken } }
          : undefined,
      );
      setToken(data.accessToken);
      persistRefreshToken(data.refreshToken);
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me.data);
      setSessionExpired(false);
    },
    [],
  );

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
    setUser(null);
    // Limpa toda a cache para o próximo login não herdar nada.
    queryClient.clear();
  }, []);

  /**
   * Simulação de login (admin): passa a "ver como" o usuário-alvo. O backend
   * re-emite a sessão com a identidade do alvo + o claim do admin; aqui só
   * recarregamos o /auth/me e limpamos a cache (pra não herdar dados do admin).
   */
  const impersonate = useCallback(async (userId: string): Promise<AuthUser> => {
    await api.post(`/auth/impersonate/${userId}`);
    queryClient.clear();
    localStorage.removeItem('p2p_company');
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me.data);
    return me.data;
  }, []);

  /** Sai da simulação: volta a ser o admin real. */
  const exitImpersonation = useCallback(async (): Promise<AuthUser> => {
    await api.post('/auth/impersonate/exit');
    queryClient.clear();
    localStorage.removeItem('p2p_company');
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me.data);
    return me.data;
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
        loginLocal,
        logout,
        impersonate,
        exitImpersonation,
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
