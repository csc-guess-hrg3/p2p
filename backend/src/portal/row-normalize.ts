/**
 * Normaliza um valor cru vindo de $queryRaw para algo serializável em JSON e
 * limpo para exibição. Compartilhado pelas leituras do portal.
 *
 * - string  → rtrim (tira padding de CHAR do ERP)
 * - bigint  → number se couber no safe-integer, senão string (preserva dígitos)
 * - Date    → mantém (Nest serializa p/ ISO)
 * - Buffer/Uint8Array → hex
 * - Prisma.Decimal e afins → string se inteiro > safe-integer; senão number
 */
export function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.replace(/\s+$/, '');
  if (typeof v === 'bigint') {
    return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  }
  if (v instanceof Date) return v;
  if (Buffer.isBuffer(v)) return '0x' + v.toString('hex');
  if (v instanceof Uint8Array) return '0x' + Buffer.from(v).toString('hex');
  if (typeof v === 'object') {
    const o = v as { toNumber?: () => number; toString?: () => string };
    if (typeof o.toString === 'function') {
      const s = o.toString();
      if (/^-?\d+$/.test(s)) {
        const n = Number(s);
        return Number.isSafeInteger(n) ? n : s;
      }
      const n = Number(s);
      return Number.isNaN(n) ? s : n;
    }
    if (typeof o.toNumber === 'function') return o.toNumber();
  }
  return v;
}

export function normalizeRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = normalizeValue(v);
  return out;
}

/** Código de escopo/identificador: só alfanumérico (defense-in-depth). */
export function safeCode(k: string, max = 25): string {
  return (k ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, max);
}

/** Escapa uma string p/ literal SQL (dobra aspas simples). Não-destrutivo. */
export function sqlLiteral(s: string): string {
  return `'${(s ?? '').replace(/'/g, "''")}'`;
}
