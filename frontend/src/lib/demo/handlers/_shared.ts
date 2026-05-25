/**
 * Helpers compartilhados pelos handlers do modo demo.
 *
 * Cada handler de domínio (auth, requisitions, …) importa daqui os
 * tipos de resposta, os builders (`ok`, `notFound`, ...) e utilitários
 * (`uid`, `todayIso`, `nextNumber`, `paginate`, `filterByQuery`,
 * `parseUrl`). O dispatcher (`./index.ts`) é quem chama cada handler.
 */
import { getDemoSessionUserId, getDemoState } from '../state';

export type Json =
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined
  | string
  | number
  | boolean;

export interface DemoResponse {
  // `unknown` em vez de Json para suportar Blob (download de anexo demo).
  status: number;
  data: Json | Blob;
}

export function ok(data: Json): DemoResponse {
  return { status: 200, data };
}
export function notFound(
  message = 'Recurso não encontrado (demo).',
): DemoResponse {
  return { status: 404, data: { statusCode: 404, message } };
}
export function badRequest(message: string): DemoResponse {
  return { status: 400, data: { statusCode: 400, message } };
}
export function unauthorized(
  message = 'Sessão demo inválida.',
): DemoResponse {
  return { status: 401, data: { statusCode: 401, message } };
}

export function uid(prefix = ''): string {
  const u =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}-${u}` : u;
}

export function todayIso(): string {
  return new Date().toISOString();
}

/** Próximo nº sequencial para um prefixo (REQ/OC/SV/REC). */
export function nextNumber(prefix: string): string {
  const state = getDemoState();
  const list = [
    ...state.requisitions.map((r) => r.number),
    ...state.purchaseOrders.map((p) => p.number),
    ...state.fundRequests.map((f) => f.number),
    ...((state as { receivings?: { number: string }[] }).receivings ?? []).map(
      (r) => r.number,
    ),
  ];
  const filtered = list.filter((n) => n.startsWith(`${prefix}-DEMO-`));
  const max = filtered.reduce((acc, n) => {
    const m = n.match(/(\d{6})$/);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefix}-DEMO-${String(max + 1).padStart(6, '0')}`;
}

/** Paginação típica — envelope `{ data, total, skip, take }`. */
export function paginate<T>(
  list: T[],
  query: URLSearchParams,
): { data: T[]; total: number; skip: number; take: number } {
  const skip = Number(query.get('skip') ?? 0);
  const take = Number(query.get('take') ?? 50);
  return {
    data: list.slice(skip, skip + take),
    total: list.length,
    skip,
    take,
  };
}

/**
 * Filtro genérico por `status`, `mine` (requesterId/buyerId do usuário
 * corrente) e `search` (em campos especificados).
 */
export function filterByQuery<T extends Record<string, unknown>>(
  list: T[],
  query: URLSearchParams,
  searchFields: string[],
): T[] {
  const status = query.get('status');
  const search = query.get('search');
  const mine = query.get('mine') === 'true';
  const userId = getDemoSessionUserId();
  return list.filter((r) => {
    if (status && r.status !== status) return false;
    if (mine && r.requesterId !== userId && r.buyerId !== userId) return false;
    if (search) {
      const s = search.toLowerCase();
      const hit = searchFields.some((f) =>
        String(r[f] ?? '').toLowerCase().includes(s),
      );
      if (!hit) return false;
    }
    return true;
  });
}

/** Parse de uma URL relativa em path/segments/query. */
export function parseUrl(rawUrl: string): {
  path: string;
  segments: string[];
  query: URLSearchParams;
} {
  // remove baseURL se vier
  const url = rawUrl.replace(/^\/api(-hml)?/, '');
  const [path, qs = ''] = url.split('?');
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return {
    path: trimmed,
    segments: trimmed.split('/'),
    query: new URLSearchParams(qs),
  };
}
