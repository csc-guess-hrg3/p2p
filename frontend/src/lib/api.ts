import axios from 'axios';

const TOKEN_KEY = 'p2p_token';
const ENV_KEY = 'p2p_env';

export type AppEnv = 'PROD' | 'HML';

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

/** Cliente HTTP do P2P. O baseURL é resolvido por requisição (PROD/HML). */
export const api = axios.create();

// Define o ambiente e anexa o JWT em toda requisição.
api.interceptors.request.use((config) => {
  config.baseURL = apiBase();
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sessão expirada -> limpa o token e volta ao login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
