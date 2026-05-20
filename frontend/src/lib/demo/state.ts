/**
 * Persistência do estado do modo demo em localStorage.
 * Versionado: se o `seed.ts` mudar, bump em DEMO_STATE_VERSION força reset.
 */
import { buildSeed, DEMO_STATE_VERSION, type DemoState } from './seed';

const STORAGE_KEY = 'p2p_demo_state_v1';
const ACTIVE_KEY = 'p2p_demo_mode';
const SESSION_KEY = 'p2p_demo_session_user_id';

/** Liga/desliga o modo demo (apenas no client). */
export function setDemoMode(active: boolean): void {
  if (active) {
    localStorage.setItem(ACTIVE_KEY, '1');
  } else {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
}

export function isDemoMode(): boolean {
  return localStorage.getItem(ACTIVE_KEY) === '1';
}

/** Lê o estado atual; se faltar ou estiver em versão antiga, recria. */
export function getDemoState(): DemoState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === DEMO_STATE_VERSION) return parsed;
    } catch {
      // formato corrompido — recria
    }
  }
  const seed = buildSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function saveDemoState(state: DemoState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Aplica uma função sobre o estado atual e persiste o resultado. */
export function mutateDemoState<T>(
  fn: (state: DemoState) => T,
): T {
  const state = getDemoState();
  const result = fn(state);
  saveDemoState(state);
  return result;
}

/** Reseta o estado (volta ao seed). Usado pelo botão "Resetar demo". */
export function resetDemoState(): void {
  localStorage.removeItem(STORAGE_KEY);
  getDemoState(); // recria
}

/** ID do usuário demo logado nesta sessão (gravado em localStorage). */
export function getDemoSessionUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}
export function setDemoSessionUserId(id: string | null): void {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}
