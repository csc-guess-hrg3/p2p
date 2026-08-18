import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ReportScopeService } from './report-scope.service';
import { findReport, reportsForCategory, ReportDef } from './report-registry';

export interface ReportColumn {
  name: string;
  type: string;
}

export interface ReportListItem {
  key: string;
  title: string;
  description: string;
}

export interface ReportResult extends ReportListItem {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** true se a consulta atingiu o teto de linhas (paginação real é fase de exibição). */
  capped: boolean;
  generatedAt: string;
}

/** Teto defensivo de linhas — por-rep é sempre pequeno (centenas). */
const ROW_CAP = 10_000;

@Injectable()
export class ReportExecutorService {
  private readonly logger = new Logger(ReportExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ReportScopeService,
  ) {}

  /** Relatórios que a categoria do usuário externo pode ver (só metadados). */
  listForUser(user: AuthenticatedUser): ReportListItem[] {
    return reportsForCategory(user.externalCategory).map((r) => ({
      key: r.key,
      title: r.title,
      description: r.description,
    }));
  }

  /**
   * Roda um relatório para o usuário externo, SEMPRE escopado às chaves dele
   * (resolvidas do banco na hora). Sem escopo → zero linhas, nunca "tudo".
   */
  async run(user: AuthenticatedUser, key: string): Promise<ReportResult> {
    const def = findReport(user.externalCategory, key);
    if (!def) {
      // Não vaza se o relatório existe em outra categoria — é 404 pra este user.
      throw new NotFoundException('Relatório não encontrado.');
    }

    const codes = (await this.scope.scopeKeys(user.id, def.scopeType)).map(
      (c) => this.safeKey(c),
    );

    const columns = await this.columnsOf(def);

    // Sem escopo (ou escopo inválido após sanitização) → nada. Barreira dura.
    const valid = codes.filter((c) => c.length > 0);
    if (valid.length === 0) {
      this.logger.warn(
        `Rep ${user.id} sem escopo ${def.scopeType} — relatório '${key}' devolvido vazio.`,
      );
      return this.result(def, columns, []);
    }

    const rows = await this.readRows(def, valid);
    return this.result(def, columns, rows);
  }

  // ─── internos ───

  private result(
    def: ReportDef,
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
  ): ReportResult {
    const capped = rows.length >= ROW_CAP;
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      columns,
      rows,
      rowCount: rows.length,
      capped,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Código de escopo: só alfanumérico (defense-in-depth). Os valores vêm do
   * nosso ExternalScopeAssignment, mas sanitizamos assim mesmo — sem isso, um
   * valor com aspa quebraria/abriria injeção na cláusula IN.
   */
  private safeKey(k: string): string {
    return (k ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 25);
  }

  /** Metadados de coluna (ordenados) — servem cabeçalho mesmo com 0 linhas. */
  private async columnsOf(def: ReportDef): Promise<ReportColumn[]> {
    const { db, schema, table } = def.source;
    // Identificadores 100% do registry (constantes) — nunca do usuário.
    const rows = await this.prisma.$queryRawUnsafe<
      { name: string; type: string }[]
    >(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type
         FROM [${db}].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION`,
    );
    return rows.map((r) => ({ name: r.name, type: r.type }));
  }

  private async readRows(
    def: ReportDef,
    codes: string[],
  ): Promise<Record<string, unknown>[]> {
    const { db, schema, table, scopeColumn } = def.source;
    // codes já sanitizados (alfanumérico) → seguro na IN-list.
    const inList = codes.map((c) => `'${c}'`).join(',');
    const raw = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP ${ROW_CAP} *
         FROM [${db}].[${schema}].[${table}]
        WHERE [${scopeColumn}] IN (${inList})`,
    );
    return raw.map((row) => this.normalizeRow(row));
  }

  /** Torna a linha serializável em JSON e limpa padding de CHAR. */
  private normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = this.normalizeValue(v);
    return out;
  }

  private normalizeValue(v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v.replace(/\s+$/, ''); // rtrim padding CHAR
    if (typeof v === 'bigint') {
      return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
    }
    if (v instanceof Date) return v; // Nest serializa p/ ISO
    if (Buffer.isBuffer(v)) return '0x' + v.toString('hex');
    if (v instanceof Uint8Array) return '0x' + Buffer.from(v).toString('hex');
    if (typeof v === 'object') {
      // Prisma.Decimal (colunas numeric/decimal/money) e afins: converte pela
      // STRING p/ não perder precisão. Inteiro além do safe-integer fica string
      // (mesma guarda do bigint); decimal vira número (o front formata).
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
}
