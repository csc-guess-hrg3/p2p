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

/** Item da lista "Meus clientes" (aba Clientes) — resumo + saldo a receber. */
export interface ClienteListItem {
  codigo: string;
  nome: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  tipo: string;
  pontualidade: string;
  aReceber: number;
  vencido: number;
  /** Data de cadastro do cliente (CADASTRAMENTO), ISO yyyy-mm-dd ou null. */
  dataCadastro: string | null;
  /** Última compra = MAX(EMISSAO) do faturamento, ISO yyyy-mm-dd ou null. */
  ultimaCompra: string | null;
}

/** Um título em aberto do rep, com a comissão dele. */
export interface ComissaoTitulo {
  cliente: string;
  documento: string;
  vencimento: string | null;
  /** A VENCER | VENCENDO HOJE | VENCIDOS. */
  posicao: string;
  /** Valor do título ainda em aberto (a receber do cliente). */
  valorAReceber: number;
  /** Taxa aplicada: 7 (padrão) ou 10 (primeiro pedido do cliente). */
  taxa: number;
  /** True quando é a 1ª nota do cliente feita por este rep (comissão 10%). */
  primeiroPedido: boolean;
  /** Comissão do rep nesse título — ele recebe quando o título é pago. */
  comissao: number;
}

export interface ComissoesResumo {
  /** Comissão total a receber (soma de todos os títulos em aberto). */
  total: number;
  /** Comissão de títulos a vencer (inclui vencendo hoje). */
  aVencer: number;
  /** Comissão de títulos vencidos (cliente em atraso — recebimento parado). */
  vencidos: number;
  titulos: number;
  vencidosTitulos: number;
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

  /** Aba Clientes — "Meus clientes": resumo + saldo a receber por cliente. */
  async clientes(
    user: AuthenticatedUser,
  ): Promise<{ clientes: ClienteListItem[] }> {
    const codes = await this.repCodes(user);
    if (!codes.length) return { clientes: [] };
    const inl = this.inList(codes);
    // Junta o saldo a receber (e o vencido) de cada cliente — o "pulso" na lista.
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT TOP ${CAP} c.CLIFOR, c.NOME_CLIFOR, c.RAZAO_SOCIAL, c.CIDADE, c.UF,
              c.TIPO, c.PONTUALIDADE,
              CONVERT(varchar(10), c.CADASTRAMENTO, 23) AS dt_cadastro,
              CONVERT(varchar(10), fat.ultima_compra, 23) AS ultima_compra,
              ISNULL(fin.receber, 0) AS receber, ISNULL(fin.vencido, 0) AS vencido
         FROM ${CLIENTES} c
         LEFT JOIN (
           SELECT LTRIM(RTRIM(NOME_CLIFOR)) AS nm,
                  SUM(VALOR_A_RECEBER) AS receber,
                  SUM(CASE WHEN DATEDIFF(DD,[VENCIMENTO_REAL],GETDATE()) > 0
                           THEN VALOR_A_RECEBER ELSE 0 END) AS vencido
             FROM ${FINANCEIRO} WHERE cod_representante IN (${inl})
            GROUP BY LTRIM(RTRIM(NOME_CLIFOR))
         ) fin ON fin.nm = LTRIM(RTRIM(c.NOME_CLIFOR))
         LEFT JOIN (
           SELECT LTRIM(RTRIM(NOME_CLIFOR)) AS nm, MAX(EMISSAO) AS ultima_compra
             FROM ${FATURAMENTOS} WHERE cod_representante IN (${inl})
            GROUP BY LTRIM(RTRIM(NOME_CLIFOR))
         ) fat ON fat.nm = LTRIM(RTRIM(c.NOME_CLIFOR))
        WHERE c.cod_representante IN (${inl})
        ORDER BY c.NOME_CLIFOR, c.CLIFOR`,
    );
    // Uma linha por cliente — a view pode repetir CLIFOR (fan-out por filial).
    const seen = new Set<string>();
    const clientes: ClienteListItem[] = [];
    for (const raw of rows) {
      const r = normalizeRow(raw);
      const codigo = typeof r.CLIFOR === 'string' ? r.CLIFOR : '';
      if (!codigo || seen.has(codigo)) continue;
      seen.add(codigo);
      clientes.push({
        codigo,
        nome: typeof r.NOME_CLIFOR === 'string' ? r.NOME_CLIFOR : '',
        razaoSocial: typeof r.RAZAO_SOCIAL === 'string' ? r.RAZAO_SOCIAL : '',
        cidade: typeof r.CIDADE === 'string' ? r.CIDADE : '',
        uf: typeof r.UF === 'string' ? r.UF : '',
        tipo: typeof r.TIPO === 'string' ? r.TIPO : '',
        pontualidade: typeof r.PONTUALIDADE === 'string' ? r.PONTUALIDADE : '',
        aReceber: Number(r.receber) || 0,
        vencido: Number(r.vencido) || 0,
        dataCadastro: typeof r.dt_cadastro === 'string' ? r.dt_cadastro : null,
        ultimaCompra: typeof r.ultima_compra === 'string' ? r.ultima_compra : null,
      });
    }
    return { clientes };
  }

  /** Aba Dados 1 — ficha do cliente (header estruturado + grupos). */
  async dados1(user: AuthenticatedUser, codigo: string) {
    const raw = await this.clientRow(user, codigo);
    const row = normalizeRow(raw);
    const s = (k: string): string =>
      typeof row[k] === 'string' ? (row[k] as string) : '';
    const groups = DADOS1_GROUPS.map((g) => ({
      title: g.title,
      fields: g.fields.map((f) => ({
        label: f.label,
        value: row[f.col] ?? null,
      })),
    }));
    const cliente = {
      nome: this.clientNome(raw),
      codigo: s('CLIFOR'),
      razaoSocial: s('RAZAO_SOCIAL'),
      cnpj: s('CGC_CPF'),
      ie: s('RG_IE'),
      cidade: s('CIDADE'),
      uf: s('UF'),
      tipo: s('TIPO'),
      email: s('EMAIL'),
      ddd: s('DDD1'),
      telefone: s('TELEFONE1'),
      pontualidade: s('PONTUALIDADE'),
    };
    return { cliente, groups };
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

  /**
   * Comissões A RECEBER do representante. Regra de NEGÓCIO (fonte: PO):
   *  - PADRÃO: 7% do valor de CADA PARCELA (título), recebido conforme o
   *    cliente paga.
   *  - PRIMEIRO PEDIDO: 10% quando o título pertence à 1ª nota do cliente na
   *    base (menor EMISSAO, não cancelada/devolução) FEITA por este rep — ou
   *    seja, o rep trouxe o cliente. Como os títulos já são do rep, basta o NF
   *    do título casar com a 1ª nota do cliente. Cada parcela desse 1º pedido
   *    vira 10%; as demais compras do cliente voltam a 7%.
   * Como a view v_p2p_rep_financeiro só tem títulos em ABERTO, a soma é o que
   * ele tem a receber (some conforme o cliente paga). NÃO usa a coluna COMISSAO
   * do ERP (é outro cálculo). Escopo por cod_representante.
   */
  async comissoes(
    user: AuthenticatedUser,
  ): Promise<{ resumo: ComissoesResumo; titulos: ComissaoTitulo[] }> {
    const vazio: ComissoesResumo = {
      total: 0,
      aVencer: 0,
      vencidos: 0,
      titulos: 0,
      vencidosTitulos: 0,
    };
    const codes = await this.repCodes(user);
    if (!codes.length) return { resumo: vazio, titulos: [] };
    const inl = this.inList(codes);
    // `primeiro` = o NF do título é a 1ª nota (não cancelada/devolução) do
    // cliente na base — e como o título é do rep, foi ELE que a fez → 10%.
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `WITH tit AS (
         SELECT RTRIM(NOME_CLIFOR) AS cliente, RTRIM(DOCUMENTO) AS nf, POSICAO,
                VALOR_A_RECEBER,
                CONVERT(varchar(10), VENCIMENTO_REAL, 23) AS vencimento
           FROM ${FINANCEIRO}
          WHERE cod_representante IN (${inl})
       ),
       firstn AS (
         SELECT RTRIM(f.NOME_CLIFOR) AS cliente, RTRIM(f.NF_SAIDA) AS nf,
                ROW_NUMBER() OVER (
                  PARTITION BY RTRIM(f.NOME_CLIFOR)
                  ORDER BY f.EMISSAO ASC, f.NF_SAIDA ASC) AS rn
           FROM [GUESS_PRODUCAO].[dbo].[FATURAMENTO] f
          WHERE ISNULL(f.NOTA_CANCELADA, 0) = 0
            AND ISNULL(f.DEVOLUCAO, 0) = 0
            AND RTRIM(f.NOME_CLIFOR) IN (SELECT DISTINCT cliente FROM tit)
       )
       SELECT TOP ${CAP} t.cliente, t.nf AS documento, t.POSICAO,
              t.VALOR_A_RECEBER, t.vencimento,
              CASE WHEN fn.nf IS NOT NULL THEN 1 ELSE 0 END AS primeiro
         FROM tit t
         LEFT JOIN firstn fn
           ON fn.rn = 1 AND fn.cliente = t.cliente AND fn.nf = t.nf
        ORDER BY t.vencimento`,
    );
    const titulos: ComissaoTitulo[] = [];
    const resumo: ComissoesResumo = { ...vazio };
    const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    for (const raw of rows) {
      const r = normalizeRow(raw);
      const posicao = typeof r.POSICAO === 'string' ? r.POSICAO.trim() : '';
      const valorAReceber = Number(r.VALOR_A_RECEBER) || 0;
      const primeiroPedido = Number(r.primeiro) === 1;
      const taxa = primeiroPedido ? 10 : 7;
      const comissao = cents(valorAReceber * (taxa / 100));
      const vencido = posicao.toUpperCase().includes('VENCID');
      resumo.total += comissao;
      if (vencido) {
        resumo.vencidos += comissao;
        resumo.vencidosTitulos += 1;
      } else {
        resumo.aVencer += comissao;
      }
      titulos.push({
        cliente: typeof r.cliente === 'string' ? r.cliente.trim() : '',
        documento: typeof r.documento === 'string' ? r.documento.trim() : '',
        vencimento: typeof r.vencimento === 'string' ? r.vencimento : null,
        posicao,
        valorAReceber,
        taxa,
        primeiroPedido,
        comissao,
      });
    }
    resumo.titulos = titulos.length;
    resumo.total = cents(resumo.total);
    resumo.aVencer = cents(resumo.aVencer);
    resumo.vencidos = cents(resumo.vencidos);
    return { resumo, titulos };
  }
}
