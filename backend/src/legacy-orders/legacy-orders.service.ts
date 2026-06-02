import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QiveClientService } from '../integration/qive-client.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { safeDbName } from '../common/erp/safe-db-name';

/**
 * Tradução dos códigos Linx para descrição humana.
 * Valores observados em PROD/HML (ver scripts/explore-entradas-*.js).
 * STATUS_COMPRA é case-insensitive — 'A'/'a' = mesma coisa, padding com espaços.
 */
function labelStatusCompra(s: string | null): string | null {
  if (!s) return null;
  const k = s.trim().toUpperCase();
  switch (k) {
    case 'A':
      return 'Ativo';
    case 'E':
      return 'Encerrado';
    case 'C':
      return 'Cancelado';
    case 'R':
      return 'Reprovado';
    case '':
      return null;
    default:
      return k;
  }
}

function labelStatusAprovacao(s: string | null): string | null {
  if (!s) return null;
  const k = s.trim().toUpperCase();
  switch (k) {
    case 'A':
      return 'Aprovado';
    case 'P':
      return 'Pendente';
    case 'R':
      return 'Reprovado';
    case 'E':
      return 'Em análise';
    case '':
      return null;
    default:
      return k;
  }
}

/**
 * Pedidos Legados — read-through ao Linx.
 *
 * Por que existe: a operação tinha (e ainda tem) pedidos de compra
 * abertos no Linx que NUNCA passaram pelo P2P. Esses pedidos precisam
 * ficar visíveis pra consulta e pra que o time veja as NFs já entradas
 * (com download do XML quando disponível na Qive).
 *
 * Escopo: só pedidos de CONSUMÍVEL (`COMPRAS.TABELA_FILHA = 'COMPRAS_CONSUMIVEL'`).
 * Os pedidos de PA têm fluxo próprio (PaOrders).
 *
 * Cadeia de tabelas no Linx:
 *   COMPRAS (header)                 -> PEDIDO, FORNECEDOR, EMISSAO, valores
 *     └── COMPRAS_CONSUMIVEL (itens) -> CONSUMIVEL, qtde, valor
 *   ENTRADAS_ITEM (itens de NF)      -> REFERENCIA_PEDIDO liga ao pedido
 *     └── ENTRADAS (header da NF)    -> CHAVE_NFE, EMISSAO, VALOR_TOTAL
 *
 * Cross-ref com Qive: a `CHAVE_NFE` da ENTRADAS bate com `accessKey`
 * em FiscalDocument se a NF já foi baixada pelo cron. Quando bate,
 * libera download de XML; caso contrário só DANFe (read-through Qive).
 *
 * Permissão: só ADMIN (módulo restrito). Não há mutação — toda
 * operação é leitura.
 */
@Injectable()
export class LegacyOrdersService {
  private readonly logger = new Logger(LegacyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qive: QiveClientService,
  ) {}

  private requireAdmin(user: AuthenticatedUser) {
    if (user.profile !== 'ADMIN') {
      throw new ForbiddenException(
        'Pedidos Legados é módulo restrito ao ADMIN.',
      );
    }
  }

  /** Companies que o usuário enxerga (intersect com Admin = todas ativas). */
  private async resolveCompany(
    companyId: string,
  ): Promise<{ id: string; code: string; erpDbName: string; name: string }> {
    const c = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, code: true, erpDbName: true, name: true },
    });
    if (!c) throw new NotFoundException('Empresa não encontrada');
    return c;
  }

  // ──────────────────────────────────────────────────────────────────
  // LISTA
  // ──────────────────────────────────────────────────────────────────

  async list(
    user: AuthenticatedUser,
    opts: {
      companyId: string;
      search?: string;
      from?: string;
      to?: string;
      status?: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL';
      statusAprovacao?: 'A' | 'P' | 'R' | 'E';
      /**
       * Filtro de NFs:
       *  - 'any' (default): sem filtro
       *  - 'with-nf':       pedido tem ao menos 1 NF lançada no Linx
       *  - 'with-chave':    pedido tem ao menos 1 NF com CHAVE_NFE
       *                     (única consultável/baixável da Qive)
       */
      nfeFilter?: 'any' | 'with-nf' | 'with-chave';
      /** Mantido pra compat; quando true equivale a nfeFilter='with-nf'. */
      onlyWithNfe?: boolean;
      valorMin?: number;
      valorMax?: number;
      filial?: string;
      tipoCompra?: string;
      requeridoPor?: string;
      aprovadoPor?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    this.requireAdmin(user);
    const company = await this.resolveCompany(opts.companyId);
    const page = Math.max(opts.page ?? 1, 1);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);

    const conds: string[] = ["c.TABELA_FILHA = 'COMPRAS_CONSUMIVEL'"];
    if (opts.from) {
      conds.push(`c.EMISSAO >= '${opts.from.slice(0, 10)}'`);
    }
    if (opts.to) {
      conds.push(`c.EMISSAO < DATEADD(day, 1, '${opts.to.slice(0, 10)}')`);
    }
    if (opts.search) {
      // Sanitização leve — só letras/dígitos/espaço/.-/
      const s = opts.search.replace(/[^A-Za-z0-9 .\-/]/g, '').slice(0, 60);
      conds.push(
        `(RTRIM(c.PEDIDO) LIKE '%${s}%' OR c.FORNECEDOR LIKE '%${s}%')`,
      );
    }
    if (opts.status === 'OPEN') {
      // saldo a entregar > 0
      conds.push('c.TOT_QTDE_ENTREGAR > 0');
    } else if (opts.status === 'CLOSED') {
      conds.push('c.TOT_QTDE_ENTREGAR <= 0');
    } else if (opts.status === 'CANCELLED') {
      conds.push("c.STATUS_COMPRA = 'C'");
    }
    if (opts.statusAprovacao) {
      // STATUS_APROVACAO no Linx tem 1 char ('A'/'P'/'R'/'E')
      const sa = opts.statusAprovacao.replace(/[^APREapre]/g, '').slice(0, 1);
      if (sa) conds.push(`UPPER(c.STATUS_APROVACAO) = '${sa.toUpperCase()}'`);
    }
    if (opts.valorMin != null && !isNaN(opts.valorMin)) {
      conds.push(`c.TOT_VALOR_ORIGINAL >= ${Number(opts.valorMin)}`);
    }
    if (opts.valorMax != null && !isNaN(opts.valorMax)) {
      conds.push(`c.TOT_VALOR_ORIGINAL <= ${Number(opts.valorMax)}`);
    }
    if (opts.filial) {
      const f = opts.filial.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
      if (f) conds.push(`RTRIM(c.FILIAL_A_ENTREGAR) = '${f}'`);
    }
    if (opts.tipoCompra) {
      const t = opts.tipoCompra.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 50);
      if (t) conds.push(`c.TIPO_COMPRA = '${t}'`);
    }
    if (opts.requeridoPor) {
      const r = opts.requeridoPor.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 50);
      if (r) conds.push(`c.REQUERIDO_POR LIKE '%${r}%'`);
    }
    if (opts.aprovadoPor) {
      const a = opts.aprovadoPor.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 50);
      if (a)
        conds.push(
          `(c.APROVADO_POR LIKE '%${a}%' OR c.APROVADOR_POR LIKE '%${a}%')`,
        );
    }

    const db = safeDbName(company.erpDbName);

    // EXISTS extra pra filtros de NF — aplicado tanto no count quanto no list.
    const nfeFilter: 'any' | 'with-nf' | 'with-chave' =
      opts.nfeFilter ?? (opts.onlyWithNfe ? 'with-nf' : 'any');
    const nfeExistsClause =
      nfeFilter === 'with-nf'
        ? `AND EXISTS (
             SELECT 1 FROM [${db}].dbo.ENTRADAS_ITEM ei WITH (NOLOCK)
              WHERE RTRIM(ei.REFERENCIA_PEDIDO) = RTRIM(c.PEDIDO)
           )`
        : nfeFilter === 'with-chave'
          ? `AND EXISTS (
               SELECT 1
                 FROM [${db}].dbo.ENTRADAS_ITEM ei WITH (NOLOCK)
                 JOIN [${db}].dbo.ENTRADAS e WITH (NOLOCK)
                   ON RTRIM(e.NF_ENTRADA) = RTRIM(ei.NF_ENTRADA)
                  AND RTRIM(e.NOME_CLIFOR) = RTRIM(ei.NOME_CLIFOR)
                  AND RTRIM(ISNULL(e.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(ei.SERIE_NF_ENTRADA,''))
                WHERE RTRIM(ei.REFERENCIA_PEDIDO) = RTRIM(c.PEDIDO)
                  AND LEN(RTRIM(ISNULL(e.CHAVE_NFE,''))) = 44
             )`
          : '';

    const where = conds.join(' AND ');

    // Conta total — aplica o mesmo nfeExistsClause pra paginação coerente.
    const countRows = await this.prisma.$queryRawUnsafe<
      Array<{ total: number }>
    >(`SELECT COUNT(*) AS total FROM [${db}].dbo.COMPRAS c WITH (NOLOCK) WHERE ${where} ${nfeExistsClause}`);
    const total = Number(countRows[0]?.total ?? 0);

    // Paginação por OFFSET/FETCH (SQL Server 2012+)
    // ESTRATÉGIA: 2 queries pequenas em vez de 1 grande com subqueries
    // correlatas. As subqueries correlatas (nfeCount + nfeWithChaveCount)
    // estouravam o timeout do Prisma (15s) quando o universo era grande
    // (24k pedidos). Agora a query 1 pega os ~pageSize pedidos da página
    // e a query 2 agrega as contagens só pros pedidos retornados.
    const offset = (page - 1) * pageSize;
    const rowsRaw = await this.prisma.$queryRawUnsafe<
      Array<{
        pedido: string;
        fornecedor: string;
        emissao: Date | null;
        tipoCompra: string | null;
        statusCompra: string | null;
        statusAprovacao: string | null;
        lxStatusCompra: number | null;
        filialAEntregar: string | null;
        totQtdeOriginal: number | null;
        totQtdeEntregar: number | null;
        totValorOriginal: number | null;
        totValorEntregar: number | null;
      }>
    >(`
      SELECT
        RTRIM(c.PEDIDO) AS pedido,
        RTRIM(c.FORNECEDOR) AS fornecedor,
        c.EMISSAO AS emissao,
        RTRIM(c.TIPO_COMPRA) AS tipoCompra,
        RTRIM(c.STATUS_COMPRA) AS statusCompra,
        RTRIM(c.STATUS_APROVACAO) AS statusAprovacao,
        c.LX_STATUS_COMPRA AS lxStatusCompra,
        RTRIM(c.FILIAL_A_ENTREGAR) AS filialAEntregar,
        c.TOT_QTDE_ORIGINAL AS totQtdeOriginal,
        c.TOT_QTDE_ENTREGAR AS totQtdeEntregar,
        c.TOT_VALOR_ORIGINAL AS totValorOriginal,
        c.TOT_VALOR_ENTREGAR AS totValorEntregar
      FROM [${db}].dbo.COMPRAS c WITH (NOLOCK)
      WHERE ${where} ${nfeExistsClause}
      ORDER BY c.EMISSAO DESC, c.PEDIDO DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `);

    // Conta NFs só pros pedidos da página (no máx ~pageSize valores em IN).
    const pedidosOnPage = rowsRaw.map((r) => `'${r.pedido}'`);
    let nfCounts = new Map<string, { total: number; comChave: number }>();
    if (pedidosOnPage.length > 0) {
      const inList = pedidosOnPage.join(',');
      const counts = await this.prisma.$queryRawUnsafe<
        Array<{
          pedido: string;
          nfeCount: number;
          nfeWithChaveCount: number;
        }>
      >(`
        SELECT
          RTRIM(ei.REFERENCIA_PEDIDO) AS pedido,
          COUNT(DISTINCT RTRIM(ei.NF_ENTRADA) + '|' +
                         RTRIM(ei.SERIE_NF_ENTRADA) + '|' +
                         RTRIM(ei.NOME_CLIFOR)) AS nfeCount,
          COUNT(DISTINCT CASE
            WHEN LEN(RTRIM(ISNULL(e.CHAVE_NFE,''))) = 44
            THEN RTRIM(e.CHAVE_NFE) END) AS nfeWithChaveCount
        FROM [${db}].dbo.ENTRADAS_ITEM ei WITH (NOLOCK)
        LEFT JOIN [${db}].dbo.ENTRADAS e WITH (NOLOCK)
          ON RTRIM(e.NF_ENTRADA) = RTRIM(ei.NF_ENTRADA)
         AND RTRIM(e.NOME_CLIFOR) = RTRIM(ei.NOME_CLIFOR)
         AND RTRIM(ISNULL(e.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(ei.SERIE_NF_ENTRADA,''))
        WHERE RTRIM(ei.REFERENCIA_PEDIDO) IN (${inList})
        GROUP BY ei.REFERENCIA_PEDIDO
      `);
      counts.forEach((c) =>
        nfCounts.set(c.pedido.trim(), {
          total: Number(c.nfeCount ?? 0),
          comChave: Number(c.nfeWithChaveCount ?? 0),
        }),
      );
    }

    return {
      total,
      page,
      pageSize,
      company: { id: company.id, code: company.code, name: company.name },
      rows: rowsRaw.map((r) => ({
        pedido: r.pedido,
        fornecedor: r.fornecedor,
        emissao: r.emissao,
        tipoCompra: r.tipoCompra,
        statusCompra: labelStatusCompra(r.statusCompra),
        statusAprovacao: labelStatusAprovacao(r.statusAprovacao),
        lxStatusCompra: r.lxStatusCompra,
        filialAEntregar: r.filialAEntregar,
        totQtdeOriginal: Number(r.totQtdeOriginal ?? 0),
        totQtdeEntregar: Number(r.totQtdeEntregar ?? 0),
        totValorOriginal: Number(r.totValorOriginal ?? 0),
        totValorEntregar: Number(r.totValorEntregar ?? 0),
        nfeCount: nfCounts.get(r.pedido)?.total ?? 0,
        nfeWithChaveCount: nfCounts.get(r.pedido)?.comChave ?? 0,
      })),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // FACETS — valores únicos pra preencher os selects do front
  // ──────────────────────────────────────────────────────────────────

  async listFacets(user: AuthenticatedUser, companyId: string) {
    this.requireAdmin(user);
    const company = await this.resolveCompany(companyId);
    const db = safeDbName(company.erpDbName);

    const [filiais, tiposCompra, aprovadores] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ code: string }>>(`
        SELECT DISTINCT RTRIM(FILIAL_A_ENTREGAR) AS code
          FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
         WHERE TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
           AND LEN(RTRIM(ISNULL(FILIAL_A_ENTREGAR,''))) > 0
         ORDER BY code`),
      this.prisma.$queryRawUnsafe<Array<{ code: string }>>(`
        SELECT DISTINCT RTRIM(TIPO_COMPRA) AS code
          FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
         WHERE TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
           AND LEN(RTRIM(ISNULL(TIPO_COMPRA,''))) > 0
         ORDER BY code`),
      this.prisma.$queryRawUnsafe<Array<{ code: string }>>(`
        SELECT DISTINCT code FROM (
          SELECT RTRIM(APROVADO_POR) AS code
            FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
           WHERE TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
             AND LEN(RTRIM(ISNULL(APROVADO_POR,''))) > 0
          UNION
          SELECT RTRIM(APROVADOR_POR) AS code
            FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
           WHERE TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
             AND LEN(RTRIM(ISNULL(APROVADOR_POR,''))) > 0
        ) t
        ORDER BY code`),
    ]);
    return {
      filiais: filiais.map((r) => r.code),
      tiposCompra: tiposCompra.map((r) => r.code),
      aprovadores: aprovadores.map((r) => r.code),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // DETALHE
  // ──────────────────────────────────────────────────────────────────

  async detail(
    user: AuthenticatedUser,
    companyId: string,
    pedido: string,
  ) {
    this.requireAdmin(user);
    const company = await this.resolveCompany(companyId);
    const db = safeDbName(company.erpDbName);
    const ped = pedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20);

    const headerRows = await this.prisma.$queryRawUnsafe<
      Array<{
        pedido: string;
        fornecedor: string;
        emissao: Date | null;
        cadastramento: Date | null;
        condicaoPgto: string | null;
        transportadora: string | null;
        tipoCompra: string | null;
        statusCompra: string | null;
        statusAprovacao: string | null;
        lxStatusCompra: number | null;
        filialAEntregar: string | null;
        requeridoPor: string | null;
        aprovadoPor: string | null;
        dataAprovacao: Date | null;
        totQtdeOriginal: number | null;
        totQtdeEntregar: number | null;
        totValorOriginal: number | null;
        totValorEntregar: number | null;
        moeda: string | null;
        obs: string | null;
      }>
    >(`
      SELECT TOP 1
        RTRIM(PEDIDO) AS pedido,
        RTRIM(FORNECEDOR) AS fornecedor,
        EMISSAO AS emissao,
        CADASTRAMENTO AS cadastramento,
        RTRIM(CONDICAO_PGTO) AS condicaoPgto,
        RTRIM(TRANSPORTADORA) AS transportadora,
        RTRIM(TIPO_COMPRA) AS tipoCompra,
        RTRIM(STATUS_COMPRA) AS statusCompra,
        RTRIM(STATUS_APROVACAO) AS statusAprovacao,
        LX_STATUS_COMPRA AS lxStatusCompra,
        RTRIM(FILIAL_A_ENTREGAR) AS filialAEntregar,
        RTRIM(REQUERIDO_POR) AS requeridoPor,
        RTRIM(APROVADO_POR) AS aprovadoPor,
        DATA_APROVACAO AS dataAprovacao,
        TOT_QTDE_ORIGINAL AS totQtdeOriginal,
        TOT_QTDE_ENTREGAR AS totQtdeEntregar,
        TOT_VALOR_ORIGINAL AS totValorOriginal,
        TOT_VALOR_ENTREGAR AS totValorEntregar,
        RTRIM(MOEDA) AS moeda,
        CAST(OBS AS NVARCHAR(MAX)) AS obs
      FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
      WHERE RTRIM(PEDIDO) = '${ped}' AND TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
    `);
    const header = headerRows[0];
    if (!header) throw new NotFoundException('Pedido não encontrado no Linx');

    const items = await this.prisma.$queryRawUnsafe<
      Array<{
        consumivel: string;
        descConsumivel: string | null;
        unidade: string | null;
        qtdeOriginal: number;
        qtdeEntregue: number;
        qtdeEntregar: number;
        qtdeCancel: number;
        custo: number;
        valorOriginal: number;
        valorEntregue: number;
        valorEntregar: number;
        rateioFilial: string | null;
        rateioCentroCusto: string | null;
        entrega: Date | null;
      }>
    >(`
      SELECT
        RTRIM(CONSUMIVEL) AS consumivel,
        RTRIM(DESC_CONSUMIVEL) AS descConsumivel,
        RTRIM(UNIDADE) AS unidade,
        QTDE_ORIGINAL AS qtdeOriginal,
        QTDE_ENTREGUE AS qtdeEntregue,
        QTDE_ENTREGAR AS qtdeEntregar,
        QTDE_CANCEL_PEDIDO AS qtdeCancel,
        CUSTO AS custo,
        VALOR_ORIGINAL AS valorOriginal,
        VALOR_ENTREGUE AS valorEntregue,
        VALOR_ENTREGAR AS valorEntregar,
        RTRIM(RATEIO_FILIAL) AS rateioFilial,
        RTRIM(RATEIO_CENTRO_CUSTO) AS rateioCentroCusto,
        ENTREGA AS entrega
      FROM [${db}].dbo.COMPRAS_CONSUMIVEL WITH (NOLOCK)
      WHERE PEDIDO = '${ped}'
      ORDER BY CONSUMIVEL
    `);

    const nfes = await this.listNfesForOrder(db, ped);

    return {
      company: { id: company.id, code: company.code, name: company.name },
      header: {
        ...header,
        statusCompra: labelStatusCompra(header.statusCompra),
        statusAprovacao: labelStatusAprovacao(header.statusAprovacao),
        totQtdeOriginal: Number(header.totQtdeOriginal ?? 0),
        totQtdeEntregar: Number(header.totQtdeEntregar ?? 0),
        totValorOriginal: Number(header.totValorOriginal ?? 0),
        totValorEntregar: Number(header.totValorEntregar ?? 0),
      },
      items: items.map((it) => ({
        ...it,
        qtdeOriginal: Number(it.qtdeOriginal ?? 0),
        qtdeEntregue: Number(it.qtdeEntregue ?? 0),
        qtdeEntregar: Number(it.qtdeEntregar ?? 0),
        qtdeCancel: Number(it.qtdeCancel ?? 0),
        custo: Number(it.custo ?? 0),
        valorOriginal: Number(it.valorOriginal ?? 0),
        valorEntregue: Number(it.valorEntregue ?? 0),
        valorEntregar: Number(it.valorEntregar ?? 0),
      })),
      nfes,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // NFes — listagem + cross-ref com fiscal_documents (Qive)
  // ──────────────────────────────────────────────────────────────────

  private async listNfesForOrder(erpDbName: string, pedido: string) {
    const db = safeDbName(erpDbName);
    const ped = pedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        nfEntrada: string;
        serieNf: string;
        nomeClifor: string;
        emissao: Date | null;
        valorTotal: number | null;
        chaveNfe: string | null;
      }>
    >(`
      SELECT
        RTRIM(e.NF_ENTRADA) AS nfEntrada,
        RTRIM(e.SERIE_NF_ENTRADA) AS serieNf,
        RTRIM(e.NOME_CLIFOR) AS nomeClifor,
        e.EMISSAO AS emissao,
        e.VALOR_TOTAL AS valorTotal,
        RTRIM(e.CHAVE_NFE) AS chaveNfe
      FROM [${db}].dbo.ENTRADAS e WITH (NOLOCK)
      WHERE EXISTS (
        SELECT 1
          FROM [${db}].dbo.ENTRADAS_ITEM ei WITH (NOLOCK)
         WHERE RTRIM(ei.REFERENCIA_PEDIDO) = '${ped}'
           AND RTRIM(ei.NF_ENTRADA) = RTRIM(e.NF_ENTRADA)
           AND RTRIM(ei.NOME_CLIFOR) = RTRIM(e.NOME_CLIFOR)
           -- ENTRADAS tem 2 colunas de série: SERIE_NF e SERIE_NF_ENTRADA.
           -- A que bate com ENTRADAS_ITEM.SERIE_NF_ENTRADA é a homônima
           -- (a SERIE_NF na ENTRADAS é frequentemente diferente — vimos
           -- '0' vs '2' no mesmo registro).
           AND RTRIM(ISNULL(ei.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(e.SERIE_NF_ENTRADA,''))
      )
      ORDER BY e.EMISSAO DESC
    `);

    // Cross-ref com fiscal_documents (Qive) pela chave
    const keys = rows
      .map((r) => (r.chaveNfe ?? '').replace(/\D/g, ''))
      .filter((k) => k.length === 44);
    const fdMap = new Map<
      string,
      { id: string; status: string; purchaseOrderId: string | null }
    >();
    if (keys.length > 0) {
      const fds = await this.prisma.fiscalDocument.findMany({
        where: { accessKey: { in: keys }, deletedAt: null },
        select: {
          id: true,
          accessKey: true,
          status: true,
          purchaseOrderId: true,
        },
      });
      fds.forEach((fd) =>
        fdMap.set(fd.accessKey, {
          id: fd.id,
          status: fd.status,
          purchaseOrderId: fd.purchaseOrderId,
        }),
      );
    }

    return rows.map((r) => {
      const chave = (r.chaveNfe ?? '').replace(/\D/g, '');
      const fd = chave.length === 44 ? fdMap.get(chave) : undefined;
      return {
        nfEntrada: r.nfEntrada,
        serieNf: r.serieNf,
        nomeClifor: r.nomeClifor,
        emissao: r.emissao,
        valorTotal: Number(r.valorTotal ?? 0),
        chaveNfe: chave || null,
        // Sempre dá DANFe (read-through Qive aceita chave de qualquer NFe da conta).
        canDownloadDanfe: chave.length === 44,
        // XML só se já temos o arquivo (FiscalDocument).
        canDownloadXml: !!fd,
        fiscalDocumentId: fd?.id ?? null,
        fiscalDocumentStatus: fd?.status ?? null,
      };
    });
  }

  async listNfes(
    user: AuthenticatedUser,
    companyId: string,
    pedido: string,
  ) {
    this.requireAdmin(user);
    const company = await this.resolveCompany(companyId);
    return this.listNfesForOrder(safeDbName(company.erpDbName), pedido);
  }

  /**
   * DANFe por chave — read-through Qive direto.
   * Não exige FiscalDocument no P2P; usado pra pedidos legados cujas
   * NFs talvez ainda não tenham sido baixadas pelo cron.
   */
  async getDanfeByChave(
    user: AuthenticatedUser,
    chave: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    this.requireAdmin(user);
    const k = chave.replace(/\D/g, '');
    if (k.length !== 44) {
      throw new NotFoundException('Chave NFe inválida (44 dígitos esperados)');
    }
    const base64 = await this.qive.getDanfeBase64(k);
    return {
      pdf: Buffer.from(base64, 'base64'),
      filename: `DANFe-${k}.pdf`,
    };
  }
}
