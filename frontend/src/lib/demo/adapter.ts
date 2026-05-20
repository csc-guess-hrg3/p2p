/**
 * Adapter customizado do axios — quando o modo demo está ligado, intercepta
 * a request e devolve dados mockados de localStorage. Caso contrário,
 * delega para o adapter padrão (XHR no browser).
 */
import axios, {
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { isDemoMode } from './state';
import { routeDemoRequest } from './handlers';

/** Captura o adapter padrão do axios no carregamento do módulo. */
function defaultAdapter(): AxiosAdapter {
  // axios 1.x expõe getAdapter; aceita 'xhr' e 'fetch' como nomes built-in.
  const getAdapter = (axios as unknown as { getAdapter?: (names: string | string[]) => AxiosAdapter }).getAdapter;
  if (typeof getAdapter === 'function') {
    try {
      return getAdapter(['xhr', 'fetch']);
    } catch {
      // ignora — cai no fallback
    }
  }
  // Fallback: usa o adapter já registrado em `axios.defaults.adapter`.
  const fallback = (axios.defaults as { adapter?: AxiosAdapter | string | string[] }).adapter;
  if (typeof fallback === 'function') return fallback;
  // Último recurso: nunca deve acontecer em browser; se acontecer, devolve 501.
  return async () =>
    Promise.reject(new Error('Nenhum adapter HTTP disponível.'));
}

const REAL = defaultAdapter();

function toAxiosResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config,
    request: {},
  };
}

/**
 * Adapter "demo-aware": delega para `REAL` quando o modo demo está OFF.
 * No modo demo, simula latência e devolve a resposta dos handlers.
 */
export const demoAxiosAdapter: AxiosAdapter = async (config) => {
  if (!isDemoMode()) {
    return REAL(config);
  }
  const url = config.url ?? '';
  const method = config.method ?? 'GET';
  const data =
    typeof config.data === 'string'
      ? safeJson(config.data)
      : (config.data as Record<string, unknown> | undefined);

  // Latência sintética para parecer real (50-150ms).
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 90));

  const res = routeDemoRequest(method, url, data);
  if (res.status >= 400) {
    // axios espera que o adapter REJEITE em erro — mantém compat com isAxiosError.
    const err: any = new Error(
      (res.data as { message?: string })?.message ?? `Demo error ${res.status}`,
    );
    err.config = config;
    err.response = toAxiosResponse(config, res.status, res.data);
    err.isAxiosError = true;
    throw err;
  }
  return toAxiosResponse(config, res.status, res.data);
};

function safeJson(s: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Helper para usar em outros pontos (ex.: instalar uma instance de axios). */
export function installDemoAdapter(instance: { defaults: AxiosRequestConfig }): void {
  (instance.defaults as { adapter?: AxiosAdapter }).adapter = demoAxiosAdapter;
}
