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
import { queryClient } from './queryClient';
import type { AuthUser } from './types';

const REFRESH_KEY = 'p2p_refresh';

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
  loginStore: (
    cpf: string,
    password: string,
    options?: { isSetup?: boolean; turnstileToken?: string },
  ) => Promise<void>;
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
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
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
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me.data);
      setSessionExpired(false);
    },
    [],
  );

  /**
   * Login do vendedor de loja — CPF + senha. `isSetup=true` chama o
   * endpoint que ATIVA o vendedor (primeiro acesso); senão, o de login.
   */
  const loginStore = useCallback(
    async (
      cpf: string,
      password: string,
      options: { isSetup?: boolean; turnstileToken?: string } = {},
    ) => {
      queryClient.clear();
      // NÃO força env=PROD: o usuário escolheu HML/PROD no toggle do login;
      // respeitamos a escolha. (Antes força "PROD" silenciosamente —
      // vendedor que testava em HML caía em PROD sem aviso.)
      localStorage.removeItem('p2p_company');
      const endpoint = options.isSetup
        ? '/auth/store-setup-password'
        : '/auth/store-login';
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
      }>(
        endpoint,
        { cpf: cpf.replace(/\D/g, ''), password },
        options.turnstileToken
          ? { headers: { 'x-turnstile-token': options.turnstileToken } }
          : undefined,
      );
      setToken(data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
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
        loginStore,
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
