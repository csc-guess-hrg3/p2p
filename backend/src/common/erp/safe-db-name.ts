import { ForbiddenException } from '@nestjs/common';

/**
 * Allow-list de `erpDbName` permitidos. Toda interpolação direta de
 * `${erpDb}` em `$queryRawUnsafe`/`$executeRawUnsafe` PRECISA passar
 * por aqui. Sem isso, qualquer valor que entre em `Company.erpDbName`
 * via ADMIN/DBA vira vetor de SQL injection cross-database (audit C6).
 *
 * A lista é centralizada — alterar aqui é a única forma de aceitar
 * um novo banco do ERP. Em projetos multi-tenant maiores, transformar
 * em config externa; pra HRG3 (2 empresas + HML), enumeração simples
 * basta.
 *
 * Uso:
 *   const db = safeDbName(company.erpDbName);
 *   await prisma.$queryRawUnsafe(`SELECT * FROM [${db}].dbo.COMPRAS ...`);
 */
const ALLOWED_ERP_DBS = new Set(['GUESS_PRODUCAO', 'HML_GUESS', 'DB_HRG3']);

export function safeDbName(erpDbName: string | null | undefined): string {
  if (!erpDbName || !ALLOWED_ERP_DBS.has(erpDbName)) {
    throw new ForbiddenException(
      `erpDbName inválido: ${erpDbName ?? '(vazio)'}`,
    );
  }
  return erpDbName;
}

/** Devolve true se o nome é seguro — útil em testes/diagnóstico. */
export function isErpDbAllowed(name: string): boolean {
  return ALLOWED_ERP_DBS.has(name);
}

/** Lista somente leitura dos bancos permitidos (não retorna o Set interno). */
export function listAllowedErpDbs(): readonly string[] {
  return [...ALLOWED_ERP_DBS];
}

/**
 * Valida uma data destinada a interpolação direta em literal SQL
 * (`'${data}'`). Só aceita o formato ISO `YYYY-MM-DD`; qualquer outra
 * coisa vira `null`. Isso impede SQL injection via filtros de data
 * (uma aspa simples nos primeiros chars quebraria o literal). Use
 * SEMPRE que uma data vinda do usuário for interpolada num
 * `$queryRawUnsafe`.
 */
export function safeErpDate(s?: string | null): string | null {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
