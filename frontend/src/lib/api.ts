import axios from 'axios';
import { demoAxiosAdapter } from './demo/adapter';
import { isDemoMode } from './demo/state';

const TOKEN_KEY = 'p2p_token';
const ENV_KEY = 'p2p_env';

export type AppEnv = 'PROD' | 'HML';

/**
 * Token de acesso no localStorage — mantido por compatibilidade. A partir
 * desta versão, o backend também emite cookies httpOnly `p2p_token` /
 * `p2p_refresh`; quando o backend de PROD/HML estiver atualizado, o cookie
 * é o caminho preferido (mais seguro contra XSS).
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Ambiente ativo — produção ou homologação. */
export function getEnvironment(): AppEnv {
  return localStorage.getItem(ENV_KEY) === 'HML' ? 'HML' : 'PROD';
}
export function setEnvironment(env: AppEnv) {
  localStorage.setItem(ENV_KEY, env);
}

/** baseURL conforme o ambiente: HML usa o proxy /api-hml -> backend :3001. */
function apiBase(): string {
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

// Adapter "demo-aware": se o modo demonstração estiver ligado, intercepta
// e devolve dados mockados (localStorage). Caso contrário, delega para o
// adapter HTTP padrão (XHR/fetch). Setado uma única vez, no boot.
api.defaults.adapter = demoAxiosAdapter;

// Define o ambiente e anexa o JWT em toda requisição.
api.interceptors.request.use((config) => {
  config.baseURL = apiBase();
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sessão expirada -> limpa o token e dispara evento (sem window.location).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (getToken()) clearToken();
      // No modo demo, 401 só acontece se o usuário "saiu" — não recarregamos.
      if (!isDemoMode()) {
        emitSessionExpired();
      }
    }
    return Promise.reject(error);
  },
);
