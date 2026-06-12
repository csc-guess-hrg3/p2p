/**
 * Defesa CSRF para autenticação por cookie (defense-in-depth além do
 * SameSite). A app usa JWT em cookie httpOnly; sem uma checagem de intenção,
 * qualquer site malicioso poderia disparar um POST/PATCH/DELETE autenticado
 * no navegador da vítima (o cookie viaja junto).
 *
 * Estratégia: em requisições de MUTAÇÃO, o `Origin` (ou, na falta dele, o
 * `Referer`) precisa ser **same-origin** (host bate com o Host do request)
 * OU estar na allowlist configurada (FRONTEND_URLS — as mesmas origens do
 * CORS). Um ataque cross-site carrega a origem do atacante → barrado.
 *
 * Clientes não-browser (sem Origin nem Referer — ex.: integração server-to-
 * server com Bearer) passam: CSRF exige um navegador, que sempre envia ao
 * menos um dos dois numa requisição cross-site.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/** Extrai a origem (`scheme://host[:port]`) de uma URL; null se inválida. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Extrai o host (`host[:port]`) de uma URL/origem; null se inválida. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export interface CsrfCheckInput {
  method: string;
  origin?: string;
  referer?: string;
  /** Header Host do request (host[:port]). */
  host?: string;
  /** Origens permitidas (mesma lista do CORS). */
  allowedOrigins: ReadonlyArray<string>;
}

/**
 * Decide se a requisição pode prosseguir do ponto de vista de CSRF.
 * Métodos seguros (GET/HEAD/OPTIONS) sempre passam.
 */
export function isCsrfAllowed(input: CsrfCheckInput): boolean {
  if (isSafeMethod(input.method)) return true;

  // Origem candidata: Origin tem prioridade; cai pro Referer se faltar.
  const candidate = input.origin?.trim() || originOf(input.referer);

  // Sem Origin nem Referer → não é um navegador num contexto cross-site.
  // (CSRF precisa de browser, que envia ao menos um dos dois.)
  if (!candidate) return true;

  const candidateHost = hostOf(candidate);
  // Same-origin: o host da origem bate com o Host do próprio request. Um
  // atacante não consegue forjar isso a partir de outro site.
  if (candidateHost && input.host && candidateHost === input.host) return true;

  // Cross-origin explicitamente permitida (ex.: dev localhost:5173 → :3001).
  return input.allowedOrigins.includes(candidate);
}
