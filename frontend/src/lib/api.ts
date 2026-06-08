import axios from 'axios';

const TOKEN_KEY = 'p2p_token';
const ENV_KEY = 'p2p_env';

export type AppEnv = 'PROD' | 'HML';

/**
 * Modo de autenticação. O backend emite cookies httpOnly
 * `p2p_token`/`p2p_refresh` e também aceita Bearer no header (legado).
 *
 * - `cookie`  : preferido em PROD/HML — JWT vive só em cookie httpOnly,
 *               nada toca localStorage. Mais seguro contra XSS.
 * - `bearer`  : legado/debug — frontend lê/escreve token no localStorage
 *               e manda no header Authorization.
 *
 * A escolha vem da var `VITE_AUTH_MODE` no build do frontend (default
 * `cookie`). HML pode ficar em `bearer` enquanto a coordenação valida.
 */
type AuthMode = 'cookie' | 'bearer';
const AUTH_MODE: AuthMode =
  (import.meta.env?.VITE_AUTH_MODE as AuthMode) === 'bearer'
    ? 'bearer'
    : 'cookie';

/**
 * Token de acesso. Em modo cookie é apenas um "flag" booleano-like:
 * a presença indica que o usuário fez login pelo menos uma vez; o token
 * real fica no cookie httpOnly e nunca aparece aqui. Em modo bearer
 * armazena o JWT completo (compat com versões anteriores).
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  if (AUTH_MODE === 'cookie') {
    // Não persiste o JWT — basta marcar "logado" pra UI não piscar
    // tela de login enquanto o cookie está válido. O backend autentica
    // pelo cookie httpOnly sozinho.
    localStorage.setItem(TOKEN_KEY, '1');
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthMode(): AuthMode {
  return AUTH_MODE;
}

/** Ambiente ativo — produção ou homologação. */
export function getEnvironment(): AppEnv {
  return localStorage.getItem(ENV_KEY) === 'HML' ? 'HML' : 'PROD';
}
export function setEnvironment(env: AppEnv) {
  localStorage.setItem(ENV_KEY, env);
}

/**
 * baseURL conforme o ambiente.
 *
 * IMPORTANTE: o seletor PROD/HML (`/api` vs `/api-hml`) só faz sentido no
 * servidor de DEV do Vite, que tem um proxy reescrevendo `/api-hml` -> backend
 * de homologação (:3001). No BUILD DE PRODUÇÃO o front é servido pelo próprio
 * backend (single-origin, atrás do Cloudflare Tunnel) e só existe `/api` —
 * não há proxy. Forçar `/api` aqui evita chamadas a `/api-hml/...` que cairiam
 * num 404 ("Cannot POST /api-hml/...") se alguém tivesse `p2p_env=HML` salvo.
 */
function apiBase(): string {
  if (import.meta.env.PROD) return '/api';
  return getEnvironment() === 'HML' ? '/api-hml' : '/api';
}

/**
 * Evento emitido quando o backend responde 401 com sessão expirada.
 * O `AuthProvider` escuta este evento e usa o React Router para navegar
 * para /login — preserva o histórico e a árvore React (não há reload).
 */
export const SESSION_EXPIRED_EVENT = 'p2p:session-expired';
export function emitSessionExpired() {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** Cliente HTTP do P2P. O baseURL é resolvido por requisição (PROD/HML). */
export const api = axios.create({
  // Necessário para que o navegador envie/receba os cookies httpOnly de
  // sessão entre o frontend (5173) e o backend (3000/3001).
  withCredentials: true,
});

// Define o ambiente e (em modo bearer) anexa o JWT no header.
// Em modo cookie, o navegador envia `p2p_token` automaticamente
// porque `withCredentials=true` foi configurado acima.
api.interceptors.request.use((config) => {
  config.baseURL = apiBase();
  if (AUTH_MODE === 'bearer') {
    const token = getToken();
    if (token && token !== '1') {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Sessão expirada -> limpa o token e dispara evento (sem window.location).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (getToken()) clearToken();
      emitSessionExpired();
    }
    return Promise.reject(error);
  },
);
