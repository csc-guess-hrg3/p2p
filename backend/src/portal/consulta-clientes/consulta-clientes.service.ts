import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ExternalScopeType } from '../../common/enums';
import { ReportScopeService } from '../report-scope.service';
import {
  normalizeRow,
  normalizeValue,
  safeCode,
  sqlLiteral,
} from '../row-normalize';
import {
  CLIENTES_GRID,
  DADOS1_GROUPS,
  FATURAMENTOS_GRID,
  FATURAMENTOS_TOTAIS,
  FINANCEIRO_TITULOS,
  PEDIDOS_GRID,
  Col,
} from './columns';

const CLIENTES = '[GUESS_PRODUCAO].[dbo].[v_p2p_rep_clientes]';
const FATURAMENTOS = '[GUESS_PRODUCAO].[dbo].[v_p2p_rep_faturamentos]';
const FINANCEIRO = '[GUESS_PRODUCAO].[dbo].[v_p2p_rep_financeiro]';
const NOTA_PEDIDOS = '[GUESS_PRODUCAO].[dbo].[v_p2p_nota_pedidos]';
const CAP = 5000;

export interface ColumnMeta {
  name: string;
  label: string;
}
export interface Grid {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class ConsultaClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ReportScopeService,
  ) {}

  // ─── helpers ───

  private meta(cols: Col[]): ColumnMeta[] {
    return cols.map((c) => ({ name: c.col, label: c.label }));
  }

  /** Códigos do rep (sanitizados). [] => sem escopo. */
  private async repCodes(user: AuthenticatedUser): Promise<string[]> {
    const codes = await this.scope.scopeKeys(
      user.id,
      ExternalScopeType.REP_ERP_CODE,
    );
    return codes.map((c) => safeCode(c)).filter((c) => c.length > 0);
  }

  private inList(codes: string[]): string {
    return codes.map((c) => `'${c}'`).join(',');
  }

  /** Linha crua do cliente (dentro do escopo do rep). 404 se não for dele. */
  private async clientRow(
    user: AuthenticatedUser,
    codigo: string,
  ): Promise<Record<string, unknown>> {
    const codes = await this.repCodes(user);
    const cod = safeCode(codigo);
    if (!codes.length || !cod)
      throw new NotFoundException('Cliente não encontrado.');
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP 1 * FROM ${CLIENTES}
        WHERE cod_representante IN (${this.inList(codes)})
          AND RTRIM(CLIFOR) = '${cod}'`,
    );
    if (!rows.length) throw new NotFoundException('Cliente não encontrado.');
    return rows[0];
  }

  private clientNome(row: Record<string, unknown>): string {
    return typeof row.NOME_CLIFOR === 'string' ? row.NOME_CLIFOR.trim() : '';
  }

  // ─── abas ───

  /** Aba Clientes — grade dos clientes do rep. */
  async clientes(user: AuthenticatedUser): Promise<Grid> {
    const codes = await this.repCodes(user);
    const columns = this.meta(CLIENTES_GRID);
    if (!codes.length) return { columns, rows: [] };
    const select = CLIENTES_GRID.map((c) => `[${c.col}]`).join(', ');
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP ${CAP} ${select} FROM ${CLIENTES}
        WHERE cod_representante IN (${this.inList(codes)})
        ORDER BY NOME_CLIFOR, CLIFOR`,
    );
    // Uma linha por cliente — a view pode repetir CLIFOR (fan-out por filial).
    const seen = new Set<string>();
    const dedup: Record<string, unknown>[] = [];
    for (const r of rows.map(normalizeRow)) {
      const k = typeof r.CLIFOR === 'string' ? r.CLIFOR : '';
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(r);
    }
    return { columns, rows: dedup };
  }

  /** Aba Dados 1 — ficha do cliente, agrupada. */
  async dados1(user: AuthenticatedUser, codigo: string) {
    const raw = await this.clientRow(user, codigo);
    const row = normalizeRow(raw);
    const groups = DADOS1_GROUPS.map((g) => ({
      title: g.title,
      fields: g.fields.map((f) => ({
        label: f.label,
        value: row[f.col] ?? null,
      })),
    }));
    return { cliente: this.clientNome(raw), codigo: row.CLIFOR, groups };
  }

  /** Aba Faturamentos — notas do cliente + totais. */
  async faturamentos(user: AuthenticatedUser, codigo: string) {
    const raw = await this.clientRow(user, codigo);
    const nome = this.clientNome(raw);
    const codes = await this.repCodes(user);
    const columns = this.meta(FATURAMENTOS_GRID);
    // NF_SAIDA/SERIE_NF/FILIAL vêm p/ o front carregar os "Pedidos da Nota".
    const select = [
      ...new Set([
        ...FATURAMENTOS_GRID.map((c) => c.col),
        'NF_SAIDA',
        'SERIE_NF',
        'FILIAL',
      ]),
    ]
      .map((c) => `[${c}]`)
      .join(', ');
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP ${CAP} ${select} FROM ${FATURAMENTOS}
        WHERE cod_representante IN (${this.inList(codes)})
          AND LTRIM(RTRIM(NOME_CLIFOR)) = ${sqlLiteral(nome)}
        ORDER BY EMISSAO DESC`,
    );
    const norm = rows.map(normalizeRow);
    const totais = this.totais(norm, FATURAMENTOS_TOTAIS);
    return { cliente: nome, columns, rows: norm, totais };
  }

  /** Sub-grid "Pedidos da Nota" — só depois de validar que a nota é do rep/cliente. */
  async pedidosNota(
    user: AuthenticatedUser,
    codigo: string,
    nf: string,
    serie: string,
    filial: string,
  ): Promise<Grid> {
    const raw = await this.clientRow(user, codigo);
    const nome = this.clientNome(raw);
    const codes = await this.repCodes(user);
    const nfL = sqlLiteral(String(nf ?? '').trim());
    const serieL = sqlLiteral(String(serie ?? '').trim());
    const filialL = sqlLiteral(String(filial ?? '').trim());

    // A nota TEM que existir no faturamento do rep p/ esse cliente.
    const ok = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) n FROM ${FATURAMENTOS}
        WHERE cod_representante IN (${this.inList(codes)})
          AND LTRIM(RTRIM(NOME_CLIFOR)) = ${sqlLiteral(nome)}
          AND RTRIM(NF_SAIDA) = ${nfL} AND RTRIM(SERIE_NF) = ${serieL}
          AND RTRIM(FILIAL) = ${filialL}`,
    );
    const columns = this.meta(PEDIDOS_GRID);
    if (!ok[0] || Number(ok[0].n) === 0) return { columns, rows: [] };

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${PEDIDOS_GRID.map((c) => `[${c.col}]`).join(', ')}
         FROM ${NOTA_PEDIDOS}
        WHERE RTRIM(NF_SAIDA) = ${nfL} AND RTRIM(SERIE_NF) = ${serieL}
          AND RTRIM(FILIAL) = ${filialL}
          AND LTRIM(RTRIM(NOME_CLIFOR)) = ${sqlLiteral(nome)}
        ORDER BY PEDIDO, entrega`,
    );
    return { columns, rows: rows.map(normalizeRow) };
  }

  /** Aba Financeiro — matriz de aging (Vencidos × A Vencer) + títulos. */
  async financeiro(user: AuthenticatedUser, codigo: string) {
    const raw = await this.clientRow(user, codigo);
    const nome = this.clientNome(raw);
    const codes = await this.repCodes(user);
    const select = [
      ...new Set([
        ...FINANCEIRO_TITULOS.map((c) => c.col),
        'VENCIMENTO_REAL',
        'VALOR_A_RECEBER',
      ]),
    ]
      .map((c) => `[${c}]`)
      .join(', ');
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP ${CAP} ${select},
              DATEDIFF(DD, [VENCIMENTO_REAL], GETDATE()) AS DIAS_VENC
         FROM ${FINANCEIRO}
        WHERE cod_representante IN (${this.inList(codes)})
          AND LTRIM(RTRIM(NOME_CLIFOR)) = ${sqlLiteral(nome)}
        ORDER BY VENCIMENTO_REAL`,
    );
    const norm = rows.map(normalizeRow);
    return {
      cliente: nome,
      aging: this.aging(rows),
      titulos: { columns: this.meta(FINANCEIRO_TITULOS), rows: norm },
    };
  }

  // ─── cálculos ───

  private totais(rows: Record<string, unknown>[], cols: Col[]) {
    const t: Record<string, number> = {};
    for (const c of cols) {
      t[c.col] = rows.reduce((s, r) => {
        const v = r[c.col];
        return s + (typeof v === 'number' ? v : 0);
      }, 0);
    }
    return cols.map((c) => ({
      label: c.label,
      value: Math.round((t[c.col] + Number.EPSILON) * 100) / 100,
      // QTDE_TOTAL é contagem; os demais são moeda (o front formata como R$).
      money: c.col !== 'QTDE_TOTAL',
    }));
  }

  /**
   * Matriz de posição: Vencidos (7/30/>30) e A Vencer (7/30/>30) por
   * VALOR_A_RECEBER. Usa DIAS_VENC = DATEDIFF(DD, VENCIMENTO, GETDATE()) vindo
   * do SQL — mesmo relógio da coluna POSICAO da view (evita divergência de fuso
   * Node × SQL Server à noite). >0 = vencido; <=0 = a vencer.
   */
  private aging(rows: Record<string, unknown>[]) {
    const venc = { d7: 0, d30: 0, maior30: 0, total: 0 };
    const aVenc = { d7: 0, d30: 0, maior30: 0, total: 0 };
    for (const r of rows) {
      const valor = Number(normalizeValue(r.VALOR_A_RECEBER)) || 0;
      const diasRaw = r.DIAS_VENC;
      if (!valor || diasRaw === null || diasRaw === undefined) continue;
      const dias = Number(diasRaw);
      if (Number.isNaN(dias)) continue;
      const bucket = dias > 0 ? venc : aVenc;
      const n = Math.abs(dias);
      if (n <= 7) bucket.d7 += valor;
      else if (n <= 30) bucket.d30 += valor;
      else bucket.maior30 += valor;
      bucket.total += valor;
    }
    const round = (o: Record<string, number>) => {
      for (const k of Object.keys(o))
        o[k] = Math.round((o[k] + Number.EPSILON) * 100) / 100;
      return o;
    };
    return {
      vencidos: round(venc),
      aVencer: round(aVenc),
      total:
        Math.round((venc.total + aVenc.total + Number.EPSILON) * 100) / 100,
    };
  }
}
