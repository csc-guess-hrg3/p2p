import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Lê dados financeiros do Linx (W_HRG3_* / W_CTB_*) via cross-DB query
 * (3-part name `[<erpDb>].dbo.VIEW`). NÃO grava nada — Fase 1 do módulo
 * Financeiro do P2P é só read/exibição.
 *
 * # Glossário (siglas do Linx confirmadas via inspeção do schema)
 *  - SV  : Solicitação de Verba (CTB_SOLICITACAO_VERBA + _ITEM). Cabeça
 *          contém emitente, descrição; itens contêm beneficiário,
 *          valor, vencimento, conta contábil.
 *  - ITP : "Inclusão de Título a Pagar" — passivo (título do
 *          fornecedor). Vive em CTB_A_PAGAR_PARCELA, exposto em
 *          W_CTB_A_PAGAR_PARCELA.
 *  - IAD : "Inclusão de Aviso de Débito do Terceiro" — contrapartida
 *          contábil que representa o crédito que o terceiro tem
 *          contra a empresa (adiantamento concedido). Vive em
 *          CTB_AVISO_LANCAMENTO, exposto em W_CTB_AVISO_LANCAMENTO.
 *  - PEDCOM: Pedido de compra provisionado (entrada NF pendente) —
 *          provisão sintética em W_HRG3_CONTAS_PAGAR_PROVISAO.
 *
 * # Topologia descoberta (validado em PROD GUESS_PRODUCAO)
 *
 *   CTB_SOLICITACAO_VERBA       (1)
 *     └── CTB_SOLICITACAO_VERBA_ITEM  (N: itens da SV)
 *           └── CTB_SOLICITACAO_VERBA_MOV  (N: realizações)
 *                 └── CTB_LANCAMENTO (1 por mov; cada um tem 2 ITEMS:)
 *                       ├── item 1 → ITP (passivo: título a pagar)
 *                       └── item 2 → IAD (ativo: aviso débito terceiro)
 *
 *   Saldos abertos (views específicas):
 *     SV   → W_CTB_SOLICITACAO_VERBA_SALDO  (VALOR_A_PAGAR_CALC)
 *     ITP  → W_CTB_A_PAGAR_PARCELA_SALDO    (SALDO_PRINCIPAL_DEVIDO)
 *     IAD  → W_CTB_AVISO_LANCAMENTO_SALDO   (VALOR_AVISO_CALC)
 *
 * # Por que tela "Contas a Pagar" só mostra ITP e não IAD
 * A view W_CTB_A_PAGAR_PARCELA faz INNER JOIN com CTB_A_PAGAR_FATURA
 * (toda parcela exige uma fatura) e isso filtra IAD naturalmente —
 * IADs não têm fatura (vivem em CTB_AVISO_LANCAMENTO). Por isso o
 * GROUP BY LX_TIPO_LANCAMENTO devolveu só ITP (172.500 em GUESS).
 *
 * # Endpoints
 *  - GET /financial/contas-pagar  → ITP em aberto (W_CTB_A_PAGAR_PARCELA)
 *  - GET /financial/iads          → IAD em aberto (W_CTB_AVISO_LANCAMENTO)
 *  - GET /financial/provisoes     → SV/PEDCOM (W_HRG3_CONTAS_PAGAR_PROVISAO)
 *  - GET /financial/ddas          → boletos DDA (W_HRG3_*_MONITORAMENTO)
 *
 * Scopo: usuário só vê dados das empresas que ele tem acesso
 * (UserCompany). O Linx aqui é single-company por banco — GUESS vive em
 * GUESS_PRODUCAO, HRG3 em DB_HRG3 — então o filtro de tenant é o próprio
 * `erpDbName` no 3-part name; o `EMPRESA` na view é fixo = 1.
 */
@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve qual erpDbName usar — multi-tenant aqui é por banco
   * (GUESS_PRODUCAO vs DB_HRG3), não por coluna. Dentro de cada banco
   * o Linx é single-company, então `EMPRESA=1` é fixo nas views.
   */
  private async resolveCompany(
    user: AuthenticatedUser,
    companyId: string,
  ): Promise<{ erpDbName: string }> {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const c = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { erpDbName: true },
    });
    return { erpDbName: c.erpDbName };
  }

  /**
   * Allow-list de erpDbName — barra qualquer string vinda do banco que
   * não bata com os 3 valores conhecidos, antes de interpolar em SQL.
   * É backup do controle por whitelist do model Company.
   */
  private safeDbName(erpDbName: string): string {
    const allowed = new Set(['GUESS_PRODUCAO', 'HML_GUESS', 'DB_HRG3']);
    if (!allowed.has(erpDbName)) {
      throw new ForbiddenException(`erpDbName inválido: ${erpDbName}`);
    }
    return erpDbName;
  }

  /**
   * Aceita string 'YYYY-MM-DD', valida formato e devolve forma segura
   * pra interpolar em SQL Server (ou null se inválida/ausente). Recusa
   * datas malformadas — qualquer string fora do padrão vira null pra
   * não vazar SQL injection.
   */
  private safeDate(s?: string): string | null {
    if (!s) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  /** Mesma ideia pra número decimal (valor monetário). */
  private safeNum(n?: number | string): number | null {
    if (n === undefined || n === null || n === '') return null;
    const v = typeof n === 'number' ? n : Number(n);
    return Number.isFinite(v) ? v : null;
  }

  /** Sanitiza string pra LIKE/= em SQL (escapa apóstrofo). */
  private safeStr(s?: string, maxLen = 80): string | null {
    if (!s) return null;
    return s.trim().slice(0, maxLen).replace(/'/g, "''");
  }

  /**
   * Constrói cláusulas WHERE adicionais a partir de filtros comuns.
   * `cols` mapeia o alias de cada faixa (emissao, vencimento, valor,
   * filial, centroCusto) pra coluna real da view com prefixo. Quando
   * cols[x] é undefined, o filtro daquela faixa é ignorado.
   *
   * Devolve uma string que começa SEMPRE com newline + ' ' pra ser
   * concatenada após o WHERE da view (que já tem outras condições).
   */
  private buildRangeFilters(
    f: {
      emissaoFrom?: string;
      emissaoTo?: string;
      vencimentoFrom?: string;
      vencimentoTo?: string;
      valorMin?: number | string;
      valorMax?: number | string;
      filial?: string;
      centroCusto?: string;
    },
    cols: {
      emissao?: string;
      vencimento?: string;
      valor?: string;
      filial?: string;
      centroCusto?: string;
    },
  ): string {
    const parts: string[] = [];
    const ef = this.safeDate(f.emissaoFrom);
    const et = this.safeDate(f.emissaoTo);
    if (cols.emissao && ef) parts.push(`AND ${cols.emissao} >= '${ef}'`);
    if (cols.emissao && et) parts.push(`AND ${cols.emissao} <= '${et} 23:59:59'`);

    const vf = this.safeDate(f.vencimentoFrom);
    const vt = this.safeDate(f.vencimentoTo);
    if (cols.vencimento && vf)
      parts.push(`AND ${cols.vencimento} >= '${vf}'`);
    if (cols.vencimento && vt)
      parts.push(`AND ${cols.vencimento} <= '${vt} 23:59:59'`);

    const vmin = this.safeNum(f.valorMin);
    const vmax = this.safeNum(f.valorMax);
    if (cols.valor && vmin !== null) parts.push(`AND ${cols.valor} >= ${vmin}`);
    if (cols.valor && vmax !== null) parts.push(`AND ${cols.valor} <= ${vmax}`);

    const fil = this.safeStr(f.filial, 10);
    if (cols.filial && fil) parts.push(`AND ${cols.filial} = N'${fil}'`);

    const cc = this.safeStr(f.centroCusto, 20);
    if (cols.centroCusto && cc)
      parts.push(`AND ${cols.centroCusto} = N'${cc}'`);

    return parts.length ? '\n      ' + parts.join('\n      ') : '';
  }

  /**
   * Contas a Pagar — títulos vivos (W_CTB_A_PAGAR_PARCELA).
   * Filtros suportados:
   *   - status: A_VENCER | VENCIDO | PAGO
   *   - search: nome fornecedor / razão social / fatura / CNPJ
   *   - emissaoFrom/To, vencimentoFrom/To (YYYY-MM-DD)
   *   - valorMin/Max: range de SALDO_PRINCIPAL_DEVIDO
   *   - filial (codFilial), centroCusto (rateioCentroCusto)
   *   - paginação (limit/offset)
   */
  async listContasPagar(
    user: AuthenticatedUser,
    params: {
      companyId: string;
      status?: 'A_VENCER' | 'VENCIDO' | 'PAGO';
      search?: string;
      fornecedor?: string;
      emissaoFrom?: string;
      emissaoTo?: string;
      vencimentoFrom?: string;
      vencimentoTo?: string;
      valorMin?: number | string;
      valorMax?: number | string;
      filial?: string;
      centroCusto?: string;
      /** Deprecated — agrupamento agora é padrão. Mantido por compat
          durante a transição; sempre tratado como `true`. */
      groupByLancamento?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const { erpDbName } = await this.resolveCompany(
      user,
      params.companyId,
    );
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    // POSICAO da view: vencidos/em aberto/pagos. Mapeamos sem assumir
    // texto exato — coluna `SALDO_PRINCIPAL_DEVIDO` resolve.
    const today = new Date().toISOString().slice(0, 10);
    const statusFilter =
      params.status === 'PAGO'
        ? `AND p.SALDO_PRINCIPAL_DEVIDO <= 0`
        : params.status === 'VENCIDO'
          ? `AND p.SALDO_PRINCIPAL_DEVIDO > 0 AND p.VENCIMENTO_REAL < '${today}'`
          : params.status === 'A_VENCER'
            ? `AND p.SALDO_PRINCIPAL_DEVIDO > 0 AND p.VENCIMENTO_REAL >= '${today}'`
            : '';
    const search = this.safeStr(params.search) ?? '';
    // Search aceita texto livre OU número do lançamento. Quando vem
    // só dígitos, prioriza match exato em LANCAMENTO (mais útil pra
    // quem chega com o número do Linx em mãos).
    const numericSearch = /^\d+$/.test(search);
    const searchFilter = search
      ? numericSearch
        ? `AND (p.LANCAMENTO = ${Number(search)}
               OR p.NOME_CLIFOR LIKE N'%${search}%'
               OR p.FATURA LIKE N'%${search}%'
               OR p.CGC_CPF LIKE N'%${search}%')`
        : `AND (p.NOME_CLIFOR LIKE N'%${search}%'
               OR p.RAZAO_SOCIAL LIKE N'%${search}%'
               OR p.FATURA LIKE N'%${search}%'
               OR p.CGC_CPF LIKE N'%${search}%')`
      : '';
    const rangeFilter = this.buildRangeFilters(params, {
      emissao: 'p.EMISSAO',
      vencimento: 'p.VENCIMENTO_REAL',
      valor: 'p.SALDO_PRINCIPAL_DEVIDO',
      filial: 'p.COD_FILIAL',
      centroCusto: 'p.RATEIO_CENTRO_CUSTO',
    });
    const fornecedor = this.safeStr(params.fornecedor) ?? '';
    const fornecedorFilter = fornecedor
      ? `AND (p.NOME_CLIFOR LIKE N'%${fornecedor}%'
             OR p.RAZAO_SOCIAL LIKE N'%${fornecedor}%'
             OR p.CGC_CPF LIKE N'%${fornecedor.replace(/\D/g, '')}%')`
      : '';

    // Sempre agrupa por LANCAMENTO+ITEM consolidando parcelas — uma
    // fatura parcelada em N vezes vira 1 linha com totais somados.
    // O drill-down (parcelas individuais) é feito pelo endpoint
    // `getContasPagarParcelas` quando o usuário abre o modal de
    // detalhe. 170k títulos têm 1 parcela só, então essa consolidação
    // não muda nada pra eles.
    //   - qtdParcelas    : COUNT(*)
    //   - valorOriginal  : SUM (total da fatura)
    //   - saldoDevido    : SUM (quanto ainda falta pagar)
    //   - vencimento*    : MIN (próximo a vencer entre as parcelas em aberto;
    //                            quando tudo pago, MAX da última)
    //   - posicao        : pior posição entre as parcelas
    //                      (VENCIDO > VENCE HOJE > A VENCER > PAGO)
    const sql = `
      SELECT
        MAX(p.EMPRESA)        AS empresa,
        p.LANCAMENTO          AS lancamento,
        p.ITEM                AS item,
        NULL                  AS idParcela,
        MAX(p.COD_CLIFOR)     AS codClifor,
        MAX(p.NOME_CLIFOR)    AS nomeClifor,
        MAX(p.RAZAO_SOCIAL)   AS razaoSocial,
        MAX(p.CGC_CPF)        AS cnpjCpf,
        MAX(p.FATURA)         AS fatura,
        MIN(p.EMISSAO)        AS emissao,
        MIN(p.VENCIMENTO)     AS vencimento,
        -- Próximo vencimento entre as parcelas em aberto; se nada
        -- aberto, usa o último vencimento (provavelmente já pago).
        ISNULL(
          MIN(CASE WHEN p.SALDO_PRINCIPAL_DEVIDO > 0 THEN p.VENCIMENTO_REAL END),
          MAX(p.VENCIMENTO_REAL)
        )                     AS vencimentoReal,
        SUM(p.VALOR_ORIGINAL) AS valorOriginal,
        SUM(p.VALOR_A_PAGAR)  AS valorAPagar,
        SUM(p.SALDO_PRINCIPAL_DEVIDO) AS saldoDevido,
        SUM(p.TOTAL_PRINCIPAL_PAGO)   AS totalPago,
        -- Pior posição (rank: VENCIDO=3 > VENCE HOJE=2 > A VENCER=1 > PAGO=0).
        CASE MAX(CASE
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0
                        AND CONVERT(date, p.VENCIMENTO_REAL) < CONVERT(date, GETDATE())
                     THEN 3
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0
                        AND CONVERT(date, p.VENCIMENTO_REAL) = CONVERT(date, GETDATE())
                     THEN 2
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0 THEN 1
                   ELSE 0
                 END)
          WHEN 3 THEN 'VENCIDO'
          WHEN 2 THEN 'VENCE HOJE'
          WHEN 1 THEN 'A VENCER'
          ELSE 'PAGO'
        END                   AS posicao,
        MAX(p.LX_TIPO_LANCAMENTO)    AS tipoLancamento,
        MAX(p.LX_STATUS_CONCILIACAO) AS statusConciliacao,
        -- Descrição vem da tabela-domínio do Linx (ex.: AP→"AVISO DE
        -- DÉBITO PENDENTE", DQ→"DOCUMENTO QUITADO"). subquery pq
        -- estamos agregando — não dá pra fazer JOIN direto aqui.
        (SELECT TOP 1 DESCRICAO
           FROM [${db}].dbo.STATUS_CONCILIACAO_A_PAGAR
          WHERE LX_STATUS_CONCILIACAO = MAX(p.LX_STATUS_CONCILIACAO)) AS descStatusConciliacao,
        -- CONCILIADO_DDA é bit no Linx; MAX não aceita bit no SQL Server,
        -- então cast pra int. Pra fins de exibição um único valor é o
        -- suficiente (todas as parcelas do mesmo título compartilham a
        -- flag de conciliação na maioria dos casos).
        CAST(MAX(CAST(p.CONCILIADO_DDA AS INT)) AS BIT) AS conciliadoDda,
        MAX(p.COD_FILIAL)            AS codFilial,
        MAX(p.RAZAO_FILIAL)          AS razaoFilial,
        MAX(p.CONTA_CONTABIL)        AS contaContabil,
        COUNT(*)              AS qtdParcelas
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA p WITH (NOLOCK)
      WHERE p.EMPRESA = 1
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      ${fornecedorFilter}
      GROUP BY p.LANCAMENTO, p.ITEM
      ORDER BY MIN(p.VENCIMENTO_REAL) DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
    );
    return { items: rows, limit, offset };
  }

  /**
   * Visão "Documento": agrupa por LANCAMENTO (sem desmembrar ITEM).
   * Útil pra confronto contra a NF física — mostra o total bruto do
   * documento e quantos items contábeis ele gerou (principal +
   * retenções tipo IRRF, PIS/COFINS, CSLL etc.).
   *
   * Reaproveita todos os filtros da listagem por título (status,
   * search, range de datas/valor, filial, CC, fornecedor).
   */
  async listContasPagarDocumentos(
    user: AuthenticatedUser,
    params: Parameters<typeof this.listContasPagar>[1],
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    const today = new Date().toISOString().slice(0, 10);
    const statusFilter =
      params.status === 'PAGO'
        ? `AND p.SALDO_PRINCIPAL_DEVIDO <= 0`
        : params.status === 'VENCIDO'
          ? `AND p.SALDO_PRINCIPAL_DEVIDO > 0 AND p.VENCIMENTO_REAL < '${today}'`
          : params.status === 'A_VENCER'
            ? `AND p.SALDO_PRINCIPAL_DEVIDO > 0 AND p.VENCIMENTO_REAL >= '${today}'`
            : '';
    const search = this.safeStr(params.search) ?? '';
    const numericSearch = /^\d+$/.test(search);
    const searchFilter = search
      ? numericSearch
        ? `AND (p.LANCAMENTO = ${Number(search)}
               OR p.NOME_CLIFOR LIKE N'%${search}%'
               OR p.FATURA LIKE N'%${search}%'
               OR p.CGC_CPF LIKE N'%${search}%')`
        : `AND (p.NOME_CLIFOR LIKE N'%${search}%'
               OR p.RAZAO_SOCIAL LIKE N'%${search}%'
               OR p.FATURA LIKE N'%${search}%'
               OR p.CGC_CPF LIKE N'%${search}%')`
      : '';
    const rangeFilter = this.buildRangeFilters(params, {
      emissao: 'p.EMISSAO',
      vencimento: 'p.VENCIMENTO_REAL',
      valor: 'p.SALDO_PRINCIPAL_DEVIDO',
      filial: 'p.COD_FILIAL',
      centroCusto: 'p.RATEIO_CENTRO_CUSTO',
    });
    const fornecedor = this.safeStr(params.fornecedor) ?? '';
    const fornecedorFilter = fornecedor
      ? `AND (p.NOME_CLIFOR LIKE N'%${fornecedor}%'
             OR p.RAZAO_SOCIAL LIKE N'%${fornecedor}%'
             OR p.CGC_CPF LIKE N'%${fornecedor.replace(/\D/g, '')}%')`
      : '';

    const sql = `
      SELECT
        p.LANCAMENTO          AS lancamento,
        MAX(p.COD_CLIFOR)     AS codClifor,
        MAX(p.NOME_CLIFOR)    AS nomeClifor,
        MAX(p.RAZAO_SOCIAL)   AS razaoSocial,
        MAX(p.CGC_CPF)        AS cnpjCpf,
        -- A FATURA "raiz" é a do ITEM 1 (principal). Os outros itens
        -- são retenções com sufixo (-1, -2…) — pegamos o menor pra
        -- representar o documento.
        MIN(p.FATURA)         AS fatura,
        MIN(p.EMISSAO)        AS emissao,
        ISNULL(
          MIN(CASE WHEN p.SALDO_PRINCIPAL_DEVIDO > 0 THEN p.VENCIMENTO_REAL END),
          MAX(p.VENCIMENTO_REAL)
        )                     AS vencimentoReal,
        SUM(p.VALOR_ORIGINAL) AS valorOriginal,
        SUM(p.SALDO_PRINCIPAL_DEVIDO) AS saldoDevido,
        SUM(p.TOTAL_PRINCIPAL_PAGO)   AS totalPago,
        CASE MAX(CASE
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0
                        AND CONVERT(date, p.VENCIMENTO_REAL) < CONVERT(date, GETDATE())
                     THEN 3
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0
                        AND CONVERT(date, p.VENCIMENTO_REAL) = CONVERT(date, GETDATE())
                     THEN 2
                   WHEN p.SALDO_PRINCIPAL_DEVIDO > 0 THEN 1
                   ELSE 0
                 END)
          WHEN 3 THEN 'VENCIDO'
          WHEN 2 THEN 'VENCE HOJE'
          WHEN 1 THEN 'A VENCER'
          ELSE 'PAGO'
        END                   AS posicao,
        MAX(p.COD_FILIAL)     AS codFilial,
        MAX(p.RAZAO_FILIAL)   AS razaoFilial,
        COUNT(DISTINCT p.ITEM) AS qtdItens,
        COUNT(*)               AS qtdParcelas
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA p WITH (NOLOCK)
      WHERE p.EMPRESA = 1
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      ${fornecedorFilter}
      GROUP BY p.LANCAMENTO
      ORDER BY MIN(p.VENCIMENTO_REAL) DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
    );
    return { items: rows, limit, offset };
  }

  /**
   * Items contábeis de um lançamento (visão documento → drill-down).
   * Cada item é um destino de pagamento distinto: ITEM 1 vai pro
   * fornecedor, ITEM 3/4… vão pra Receita (IRRF, PIS, COFINS, CSLL).
   */
  async getContasPagarItens(
    user: AuthenticatedUser,
    params: { companyId: string; lancamento: number },
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);
    const lcto = Number(params.lancamento);
    if (!Number.isFinite(lcto)) return { items: [] };

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        p.ITEM                AS item,
        MIN(p.FATURA)         AS fatura,
        MAX(p.CONTA_CONTABIL) AS contaContabil,
        MAX(p.DESC_CONTA)     AS descConta,
        MAX(p.NOME_CLIFOR)    AS nomeClifor,
        SUM(p.VALOR_ORIGINAL) AS valorOriginal,
        SUM(p.SALDO_PRINCIPAL_DEVIDO) AS saldoDevido,
        COUNT(*)              AS qtdParcelas
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA p WITH (NOLOCK)
      WHERE p.EMPRESA = 1 AND p.LANCAMENTO = ${lcto}
      GROUP BY p.ITEM
      ORDER BY p.ITEM
    `);
    return { items: rows };
  }

  /**
   * Drill-down de um título: lista todas as parcelas individuais de
   * (LANCAMENTO, ITEM) — usado pelo modal de detalhe de Contas a Pagar
   * pra mostrar como a fatura foi quebrada em N vencimentos.
   *
   * Sem paginação porque uma fatura raramente tem mais que 60 parcelas
   * (limite alto que vimos em produção).
   */
  async getContasPagarParcelas(
    user: AuthenticatedUser,
    params: { companyId: string; lancamento: number; item: number },
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);
    const lcto = Number(params.lancamento);
    const item = Number(params.item);
    if (!Number.isFinite(lcto) || !Number.isFinite(item)) {
      return { items: [] };
    }
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        p.ID_PARCELA        AS idParcela,
        p.VENCIMENTO        AS vencimento,
        p.VENCIMENTO_REAL   AS vencimentoReal,
        p.VALOR_ORIGINAL    AS valorOriginal,
        p.VALOR_A_PAGAR     AS valorAPagar,
        p.SALDO_PRINCIPAL_DEVIDO AS saldoDevido,
        p.TOTAL_PRINCIPAL_PAGO   AS totalPago,
        CASE
          WHEN p.SALDO_PRINCIPAL_DEVIDO <= 0 THEN 'PAGO'
          WHEN CONVERT(date, p.VENCIMENTO_REAL) < CONVERT(date, GETDATE())
            THEN 'VENCIDO'
          WHEN CONVERT(date, p.VENCIMENTO_REAL) = CONVERT(date, GETDATE())
            THEN 'VENCE HOJE'
          ELSE 'A VENCER'
        END                 AS posicao,
        p.BANCO             AS banco,
        p.NUMERO_BANCARIO   AS numeroBancario,
        p.LX_STATUS_CONCILIACAO AS statusConciliacao,
        sc.DESCRICAO            AS descStatusConciliacao,
        p.CONCILIADO_DDA    AS conciliadoDda
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA p WITH (NOLOCK)
      LEFT JOIN [${db}].dbo.STATUS_CONCILIACAO_A_PAGAR sc WITH (NOLOCK)
        ON sc.LX_STATUS_CONCILIACAO = p.LX_STATUS_CONCILIACAO
      WHERE p.EMPRESA = 1
        AND p.LANCAMENTO = ${lcto}
        AND p.ITEM = ${item}
      ORDER BY p.ID_PARCELA
    `);
    return { items: rows };
  }

  /**
   * Provisões / Adiantamentos (W_HRG3_CONTAS_PAGAR_PROVISAO).
   * TIPO values observados na view (validado via SELECT DISTINCT):
   *   - SV     = Solicitação de Verba (adiantamento futuro)
   *   - PEDCOM = Pedido de Compra provisionado (entrada NF pendente)
   * Default tipo=SV pra responder o caso de uso financeiro: "ver SVs
   * provisionadas, decidir se libera IAD ou amarrar direto ao ITP" —
   * IAD/ITP aqui são ações; os códigos são valores de
   * LX_TIPO_LANCAMENTO em W_CTB_A_PAGAR_PARCELA, não em provisões.
   */
  async listProvisoes(
    user: AuthenticatedUser,
    params: {
      companyId: string;
      tipo?: string;
      search?: string;
      fornecedor?: string;
      statusAprovacao?: string;
      emissaoFrom?: string;
      emissaoTo?: string;
      vencimentoFrom?: string;
      vencimentoTo?: string;
      valorMin?: number | string;
      valorMax?: number | string;
      filial?: string;
      centroCusto?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const { erpDbName } = await this.resolveCompany(
      user,
      params.companyId,
    );
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);
    const tipo = (params.tipo ?? 'SV').replace(/[^A-Z0-9_]/gi, '').slice(0, 6);
    const search = this.safeStr(params.search) ?? '';
    const searchFilter = search
      ? `AND (v.NOME_CLIFOR LIKE N'%${search}%'
             OR v.EMITENTE LIKE N'%${search}%'
             OR v.DESC_ITEM LIKE N'%${search}%'
             OR CAST(v.ID AS VARCHAR(50)) LIKE N'%${search}%')`
      : '';
    const statusAprov = this.safeStr(params.statusAprovacao, 5) ?? '';
    const statusFilter = statusAprov
      ? `AND v.STATUS_APROVACAO = N'${statusAprov}'`
      : '';
    const rangeFilter = this.buildRangeFilters(params, {
      emissao: 'v.EMISSAO',
      vencimento: 'v.VENCIMENTO_REAL',
      valor: 'v.VALOR_ENTREGAR',
      filial: 'v.COD_FILIAL',
      centroCusto: 'v.CTB_CENTRO_CUSTO',
    });
    const provForn = this.safeStr(params.fornecedor) ?? '';
    const provFornFilter = provForn
      ? `AND (v.NOME_CLIFOR LIKE N'%${provForn}%'
             OR v.COD_CLIFOR LIKE N'%${provForn}%')`
      : '';

    const sql = `
      SELECT
        v.TIPO              AS tipo,
        v.ID                AS id,
        v.EMITENTE          AS emitente,
        v.EMISSAO           AS emissao,
        v.COD_CLIFOR        AS codClifor,
        v.NOME_CLIFOR       AS nomeClifor,
        v.CONTA_CONTABIL    AS contaContabil,
        v.DESC_ITEM         AS descItem,
        v.CTB_FILIAL        AS ctbFilial,
        v.CTB_CENTRO_CUSTO  AS ctbCentroCusto,
        v.ID_PARCELA        AS idParcela,
        v.MOEDA             AS moeda,
        v.VALOR_ORIGINAL    AS valorOriginal,
        v.VALOR_ENTREGAR    AS valorEntregar,
        v.VENCIMENTO        AS vencimento,
        v.VENCIMENTO_REAL   AS vencimentoReal,
        v.COD_FILIAL        AS codFilial,
        v.OBS               AS obs,
        v.STATUS_APROVACAO  AS statusAprovacao
      FROM [${db}].dbo.W_HRG3_CONTAS_PAGAR_PROVISAO v WITH (NOLOCK)
      WHERE v.TIPO = N'${tipo}'
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      ${provFornFilter}
      ORDER BY v.EMISSAO DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
    );
    return { items: rows, limit, offset };
  }

  /**
   * DDA — monitoramento (W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO). Cobre
   * tanto títulos já conciliados quanto pendentes (vem o status na
   * própria view).
   */
  async listDdas(
    user: AuthenticatedUser,
    params: {
      companyId: string;
      status?: 'PENDENTE' | 'BAIXADO';
      search?: string;
      recebimentoFrom?: string;
      recebimentoTo?: string;
      vencimentoFrom?: string;
      vencimentoTo?: string;
      valorMin?: number | string;
      valorMax?: number | string;
      /** Quando true, agrupa por DUPLICATA+CNPJ (1 linha por título). */
      groupByDuplicata?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const { erpDbName } = await this.resolveCompany(
      user,
      params.companyId,
    );
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    // Status real do DDA vem de LX_STATUS_CONCILIACAO (validado nos
    // dois bancos via SELECT DISTINCT):
    //   0 = INFORMAÇÃO NÃO PROCESSADA  ← aguardando ação do CP
    //   8 = TÍTULO JÁ BAIXADO           ← DDA finalizado, título pago
    // (o filtro antigo por LANCAMENTO null/not-null não funcionava
    //  porque todos os registros têm LANCAMENTO=null nessa view.)
    const statusFilter =
      params.status === 'PENDENTE'
        ? `AND d.LX_STATUS_CONCILIACAO = 0`
        : params.status === 'BAIXADO'
          ? `AND d.LX_STATUS_CONCILIACAO = 8`
          : '';
    const search = this.safeStr(params.search) ?? '';
    const searchFilter = search
      ? `AND (d.RAZAO_SOCIAL LIKE N'%${search}%'
             OR d.CNPJ LIKE N'%${search}%'
             OR d.DUPLICATA LIKE N'%${search}%'
             OR d.CODIGO_BARRA LIKE N'%${search}%')`
      : '';
    // DDA usa nome diferente pro range de "emissão" — aqui é
    // DATA_RECEBIMENTO (quando o banco enviou o boleto pro ERP).
    const rangeFilter = this.buildRangeFilters(
      {
        emissaoFrom: params.recebimentoFrom,
        emissaoTo: params.recebimentoTo,
        vencimentoFrom: params.vencimentoFrom,
        vencimentoTo: params.vencimentoTo,
        valorMin: params.valorMin,
        valorMax: params.valorMax,
      },
      {
        emissao: 'd.DATA_RECEBIMENTO',
        vencimento: 'd.VENCIMENTO',
        valor: 'd.VALOR_TITULO',
      },
    );

    // Agrupamento por TÍTULO real (não só por duplicata).
    //
    // Descobrimos que a view W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO tem
    // duplicação: cada movimento aparece 2x idêntico (provável JOIN
    // cartesiano no Linx). Além disso, uma mesma "DUPLICATA" do
    // fornecedor pode representar múltiplas parcelas (vencimentos
    // diferentes) — agrupar só por DUPLICATA+CNPJ misturava parcelas.
    //
    // Agora agrupamos por (DUPLICATA, CNPJ, VENCIMENTO, VALOR_TITULO):
    //   - 1 linha por título individual (parcela)
    //   - qtdMovimentos = COUNT(DISTINCT arquivo+item) — quantos
    //     arquivos de retorno do banco atualizaram este título
    //     (incluindo a duplicação da view, mas o número fica mais útil)
    const sql = params.groupByDuplicata
      ? `
      SELECT
        MAX(d.ID_ARQUIVO)        AS idArquivo,
        MAX(d.ITEM_ARQUIVO)      AS itemArquivo,
        NULL                     AS nomeArquivo,
        MAX(d.DATA_RECEBIMENTO)  AS dataRecebimento,
        MAX(d.LANCAMENTO)        AS lancamento,
        MAX(d.ITEM)              AS item,
        d.DUPLICATA              AS duplicata,
        MIN(d.EMISSAO)           AS emissao,
        d.VENCIMENTO             AS vencimento,
        d.VALOR_TITULO           AS valorTitulo,
        MAX(d.NUMERO_CONTA_CORRENTE) AS contaCorrente,
        MAX(d.LAYOUT)            AS layout,
        MAX(d.DESC_LAYOUT)       AS descLayout,
        MAX(d.TIPO_CONCILIACAO)  AS tipoConciliacao,
        MAX(d.LX_STATUS_CONCILIACAO) AS statusConciliacao,
        MAX(d.DESC_STATUS)       AS descStatus,
        MAX(d.COD_CLIFOR)        AS codClifor,
        d.CNPJ                   AS cnpj,
        MAX(d.RAZAO_SOCIAL)      AS razaoSocial,
        MAX(d.COD_FILIAL)        AS codFilial,
        MAX(d.CNPJ_FILIAL)       AS cnpjFilial,
        MAX(d.CODIGO_BARRA)      AS codigoBarra,
        MAX(d.ult_movimento)     AS ultMovimento,
        COUNT(DISTINCT CAST(d.ID_ARQUIVO AS VARCHAR) + '/' + CAST(d.ITEM_ARQUIVO AS VARCHAR)) AS qtdMovimentos
      FROM [${db}].dbo.W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO d WITH (NOLOCK)
      WHERE 1 = 1
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      GROUP BY d.DUPLICATA, d.CNPJ, d.VENCIMENTO, d.VALOR_TITULO
      ORDER BY MAX(d.DATA_RECEBIMENTO) DESC, d.VENCIMENTO ASC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `
      : `
      SELECT
        d.ID_ARQUIVO          AS idArquivo,
        d.ITEM_ARQUIVO        AS itemArquivo,
        d.NOME_ARQUIVO        AS nomeArquivo,
        d.DATA_RECEBIMENTO    AS dataRecebimento,
        d.LANCAMENTO          AS lancamento,
        d.ITEM                AS item,
        d.DUPLICATA           AS duplicata,
        d.EMISSAO             AS emissao,
        d.VENCIMENTO          AS vencimento,
        d.VALOR_TITULO        AS valorTitulo,
        d.NUMERO_CONTA_CORRENTE AS contaCorrente,
        d.LAYOUT              AS layout,
        d.DESC_LAYOUT         AS descLayout,
        d.TIPO_CONCILIACAO    AS tipoConciliacao,
        d.LX_STATUS_CONCILIACAO AS statusConciliacao,
        d.DESC_STATUS         AS descStatus,
        d.COD_CLIFOR          AS codClifor,
        d.CNPJ                AS cnpj,
        d.RAZAO_SOCIAL        AS razaoSocial,
        d.COD_FILIAL          AS codFilial,
        d.CNPJ_FILIAL         AS cnpjFilial,
        d.CODIGO_BARRA        AS codigoBarra,
        d.ult_movimento       AS ultMovimento,
        1                     AS qtdMovimentos
      FROM [${db}].dbo.W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO d WITH (NOLOCK)
      WHERE 1 = 1
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      ORDER BY d.DATA_RECEBIMENTO DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
    );
    return { items: rows, limit, offset };
  }

  /**
   * Adiantamentos / IAD (W_CTB_AVISO_LANCAMENTO + saldo).
   *
   * Mostra avisos de débito vivos (saldo aberto) — são as obrigações
   * que o terceiro tem contra a empresa por ter recebido adiantamento.
   * O caso típico é o que a coordenadora de CP descreve: adiantamento
   * pago via banco aguardando entrada de NF, guia de imposto, folha,
   * recibo, etc.
   *
   * Filtro de "vivo": `VALOR_AVISO_CALC <> 0` na view de saldo
   * (W_CTB_AVISO_LANCAMENTO_SALDO calcula automaticamente o saldo
   * considerando o que já foi baixado).
   *
   * Vinculo com SV (futuro): `CTB_SOLICITACAO_VERBA_MOV.LANCAMENTO` =
   * `W_CTB_AVISO_LANCAMENTO.LANCAMENTO` permite trazer a SV de origem.
   * Pra fase 1 só listamos os IADs; a navegação SV↔IAD entra quando
   * formos implementar as ações.
   */
  async listIads(
    user: AuthenticatedUser,
    params: {
      companyId: string;
      status?: 'A_VENCER' | 'VENCIDO' | 'TODOS';
      search?: string;
      fornecedor?: string;
      emissaoFrom?: string;
      emissaoTo?: string;
      vencimentoFrom?: string;
      vencimentoTo?: string;
      valorMin?: number | string;
      valorMax?: number | string;
      filial?: string;
      centroCusto?: string;
      /** Quando true, só IADs sem SV de origem. */
      semSv?: boolean;
      /** Quando true, só IADs vinculados a alguma SV. */
      comSv?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    const today = new Date().toISOString().slice(0, 10);
    const statusFilter =
      params.status === 'VENCIDO'
        ? `AND a.VENCIMENTO_REAL < '${today}'`
        : params.status === 'A_VENCER'
          ? `AND a.VENCIMENTO_REAL >= '${today}'`
          : '';
    const search = this.safeStr(params.search) ?? '';
    const iadNumeric = /^\d+$/.test(search);
    const searchFilter = search
      ? iadNumeric
        ? `AND (a.LANCAMENTO = ${Number(search)}
               OR a.NOME_CLIFOR LIKE N'%${search}%'
               OR a.CGC_CPF LIKE N'%${search}%')`
        : `AND (a.NOME_CLIFOR LIKE N'%${search}%'
               OR a.RAZAO_SOCIAL LIKE N'%${search}%'
               OR a.CGC_CPF LIKE N'%${search}%'
               OR a.DESC_AVISO_LANCAMENTO LIKE N'%${search}%')`
      : '';
    const rangeFilter = this.buildRangeFilters(params, {
      emissao: 'a.EMISSAO',
      vencimento: 'a.VENCIMENTO_REAL',
      valor: 's.VALOR_AVISO_CALC',
      filial: 'a.RATEIO_FILIAL',
      centroCusto: 'a.RATEIO_CENTRO_CUSTO',
    });
    const iadForn = this.safeStr(params.fornecedor) ?? '';
    const iadFornFilter = iadForn
      ? `AND (a.NOME_CLIFOR LIKE N'%${iadForn}%'
             OR a.RAZAO_SOCIAL LIKE N'%${iadForn}%'
             OR a.CGC_CPF LIKE N'%${iadForn.replace(/\D/g, '')}%')`
      : '';
    // Filtro SV: `sem SV` é IAD sem MOV; `com SV` é IAD com MOV.
    // Aplicado via EXISTS porque o OUTER APPLY já vem na query;
    // duplicar lá traria conflito de alias.
    const svFilter = params.semSv
      ? `AND NOT EXISTS (
           SELECT 1 FROM [${db}].dbo.CTB_SOLICITACAO_VERBA_MOV m2
           WHERE m2.EMPRESA = a.EMPRESA AND m2.LANCAMENTO = a.LANCAMENTO)`
      : params.comSv
        ? `AND EXISTS (
             SELECT 1 FROM [${db}].dbo.CTB_SOLICITACAO_VERBA_MOV m2
             WHERE m2.EMPRESA = a.EMPRESA AND m2.LANCAMENTO = a.LANCAMENTO)`
        : '';

    const sql = `
      SELECT
        a.EMPRESA               AS empresa,
        a.LANCAMENTO            AS lancamento,
        a.ITEM                  AS item,
        a.LX_TIPO_LANCAMENTO    AS tipoLancamento,
        a.COD_CLIFOR            AS codClifor,
        a.NOME_CLIFOR           AS nomeClifor,
        a.RAZAO_SOCIAL          AS razaoSocial,
        a.CGC_CPF               AS cnpjCpf,
        a.EMISSAO               AS emissao,
        a.VENCIMENTO            AS vencimento,
        a.VENCIMENTO_REAL       AS vencimentoReal,
        a.VALOR_ORIGINAL        AS valorOriginal,
        a.VALOR_AVISO           AS valorAviso,
        a.VALOR_PAGO            AS valorPago,
        s.VALOR_AVISO_CALC      AS saldoAberto,
        a.POSICAO               AS posicao,
        a.CONTA_CONTABIL        AS contaContabil,
        a.DESC_CONTA            AS descConta,
        a.RATEIO_CENTRO_CUSTO   AS rateioCentroCusto,
        a.RATEIO_FILIAL         AS rateioFilial,
        a.PEDIDO_ID_ORIGEM      AS pedidoOrigem,
        a.STATUS_APROVACAO      AS statusAprovacao,
        a.DESC_AVISO_LANCAMENTO AS descAviso,
        sv.SOLICITACAO_VERBA    AS solicitacaoVerba,
        sv.ID_SOLICITACAO_ITEM  AS solicitacaoVerbaItem
      FROM [${db}].dbo.W_CTB_AVISO_LANCAMENTO a WITH (NOLOCK)
      INNER JOIN [${db}].dbo.W_CTB_AVISO_LANCAMENTO_SALDO s WITH (NOLOCK)
        ON a.EMPRESA = s.EMPRESA
       AND a.LANCAMENTO = s.LANCAMENTO
       AND a.ITEM = s.ITEM
      OUTER APPLY (
        -- SV de origem: nem todo IAD vem de SV (manuais, importações,
        -- etc.). Quando vem, há 1 linha em CTB_SOLICITACAO_VERBA_MOV
        -- por LANCAMENTO; TOP 1 protege contra eventual duplicidade.
        SELECT TOP 1 m.SOLICITACAO_VERBA, m.ID_SOLICITACAO_ITEM
        FROM [${db}].dbo.CTB_SOLICITACAO_VERBA_MOV m WITH (NOLOCK)
        WHERE m.EMPRESA = a.EMPRESA
          AND m.LANCAMENTO = a.LANCAMENTO
      ) sv
      WHERE a.EMPRESA = 1
        AND a.LX_TIPO_LANCAMENTO = 'IAD'
        AND s.VALOR_AVISO_CALC <> 0
      ${statusFilter}
      ${searchFilter}
      ${rangeFilter}
      ${iadFornFilter}
      ${svFilter}
      ORDER BY a.VENCIMENTO_REAL DESC, a.LANCAMENTO DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      sql,
    );
    return { items: rows, limit, offset };
  }

  /**
   * Lista de filiais da empresa (para dropdown de filtro).
   * Filtra inativas (DATA_FECHAMENTO IS NULL).
   */
  async listBranches(user: AuthenticatedUser, companyId: string) {
    const { erpDbName } = await this.resolveCompany(user, companyId);
    const db = this.safeDbName(erpDbName);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ COD_FILIAL: string; FILIAL: string }>
    >(`
      SELECT COD_FILIAL, FILIAL
      FROM [${db}].dbo.FILIAIS
      WHERE EMPRESA = 1 AND DATA_FECHAMENTO IS NULL
      ORDER BY COD_FILIAL
    `);
    return rows.map((r) => ({
      code: String(r.COD_FILIAL).trim(),
      name: String(r.FILIAL).trim(),
    }));
  }

  /**
   * Lista moedas cadastradas no Linx (dbo.MOEDAS). A coluna `MOEDA`
   * é char(6) com padding ('R$    ', 'EUR   ' etc.) — devolvemos
   * `code` já trimado pra ser usado como value de Select sem
   * surpresa de espaços.
   *
   * Útil pra:
   *   - dropdown de moeda em telas que aceitam multi-moeda
   *   - escolha da moeda padrão na integração com Linx
   */
  async listCurrencies(user: AuthenticatedUser, companyId: string) {
    const { erpDbName } = await this.resolveCompany(user, companyId);
    const db = this.safeDbName(erpDbName);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        MOEDA: string;
        NOME_MOEDA: string;
        NOME_MOEDA_PLURAL: string;
        INDICA_PADRAO: boolean;
      }>
    >(`
      SELECT MOEDA, NOME_MOEDA, NOME_MOEDA_PLURAL, INDICA_PADRAO
      FROM [${db}].dbo.MOEDAS WITH (NOLOCK)
      WHERE LX_STATUS_REGISTRO = 1 OR LX_STATUS_REGISTRO IS NULL
      ORDER BY INDICA_PADRAO DESC, MOEDA
    `);
    return rows.map((r) => ({
      code: String(r.MOEDA).trim(),
      name: String(r.NOME_MOEDA ?? r.NOME_MOEDA_PLURAL ?? '').trim(),
      isDefault: !!r.INDICA_PADRAO,
    }));
  }

  /**
   * Busca fornecedores no Linx (CADASTRO_CLI_FOR) — usado pelo combobox
   * de filtro. 5,7k registros em PROD, então o frontend faz busca
   * server-side com debounce.
   */
  async searchSuppliers(
    user: AuthenticatedUser,
    params: { companyId: string; search?: string; limit?: number },
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const search = this.safeStr(params.search) ?? '';
    // Sem busca devolve só os primeiros (placeholder até o usuário
    // digitar algo); com busca filtra por nome/razão/CNPJ.
    const where = search
      ? `WHERE NOME_CLIFOR LIKE N'%${search}%'
            OR RAZAO_SOCIAL LIKE N'%${search}%'
            OR CGC_CPF LIKE N'%${search.replace(/\D/g, '')}%'`
      : '';
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ CLIFOR: string; NOME_CLIFOR: string; RAZAO_SOCIAL: string; CGC_CPF: string }>
    >(`
      SELECT TOP ${limit} CLIFOR, NOME_CLIFOR, RAZAO_SOCIAL, CGC_CPF
      FROM [${db}].dbo.CADASTRO_CLI_FOR
      ${where}
      ORDER BY NOME_CLIFOR
    `);
    return rows.map((r) => ({
      code: String(r.CLIFOR).trim(),
      name: String(r.NOME_CLIFOR).trim(),
      razaoSocial: String(r.RAZAO_SOCIAL ?? '').trim(),
      cnpj: String(r.CGC_CPF ?? '').trim(),
    }));
  }

  /**
   * Lista de centros de custo (rateio) — também só os ativos.
   * `INATIVO=0` é o padrão Linx (true = inativo).
   */
  async listCostCenters(user: AuthenticatedUser, companyId: string) {
    const { erpDbName } = await this.resolveCompany(user, companyId);
    const db = this.safeDbName(erpDbName);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ RATEIO_CENTRO_CUSTO: string; DESC_RATEIO_CENTRO_CUSTO: string }>
    >(`
      SELECT RATEIO_CENTRO_CUSTO, DESC_RATEIO_CENTRO_CUSTO
      FROM [${db}].dbo.CTB_CENTRO_CUSTO_RATEIO
      WHERE INATIVO = 0
        AND DESC_RATEIO_CENTRO_CUSTO NOT LIKE N'%INATIVO%'
      ORDER BY RATEIO_CENTRO_CUSTO
    `);
    return rows.map((r) => ({
      code: String(r.RATEIO_CENTRO_CUSTO).trim(),
      name: String(r.DESC_RATEIO_CENTRO_CUSTO).trim(),
    }));
  }

  /**
   * Saldo realizado/em aberto de uma ou mais SVs (consulta agregada
   * pra `Minha SV` do solicitante).
   *
   * Para cada `svNumber` informado, devolve:
   *   - itens         : linhas em W_CTB_SOLICITACAO_VERBA_SALDO
   *   - totalSolicitado / totalAPagar : somas a nível SV
   *
   * Fonte: `W_CTB_SOLICITACAO_VERBA_SALDO` (já agrega o que foi
   * realizado via movs vs. o que foi originalmente solicitado).
   * Valores de `VALOR_A_PAGAR` negativos = ainda há saldo aberto
   * a entregar/realizar. Quando o saldo zera, a SV está totalmente
   * realizada.
   *
   * NOTA: cada `Company` mora em `erpDbName` diferente, então a
   * consulta segura é só pela empresa ativa do usuário. SVs de
   * outra empresa não aparecem nem por engano.
   */
  async getSvSaldos(
    user: AuthenticatedUser,
    params: { companyId: string; svs: string[] },
  ) {
    const { erpDbName } = await this.resolveCompany(user, params.companyId);
    const db = this.safeDbName(erpDbName);

    // Lista de números — sanitiza só dígitos pra evitar injection,
    // limita a 200 SVs por chamada (lista típica de tela cabe nisso).
    const safeSvs = params.svs
      .map((s) => String(s).replace(/\D/g, ''))
      .filter((s) => s.length > 0)
      .slice(0, 200);
    if (safeSvs.length === 0) {
      return { saldos: {} as Record<string, unknown> };
    }
    const inList = safeSvs.join(',');

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        SOLICITACAO_VERBA: number;
        ID_SOLICITACAO_ITEM: string;
        VALOR_SOLICITADO: number | string;
        VALOR_A_PAGAR: number | string;
        VALOR_A_PAGAR_CALC: number | string;
        VENCIMENTO_REAL: Date | null;
      }>
    >(`
      SELECT SOLICITACAO_VERBA, ID_SOLICITACAO_ITEM,
             VALOR_SOLICITADO, VALOR_A_PAGAR, VALOR_A_PAGAR_CALC,
             VENCIMENTO_REAL
      FROM [${db}].dbo.W_CTB_SOLICITACAO_VERBA_SALDO
      WHERE EMPRESA = 1 AND SOLICITACAO_VERBA IN (${inList})
      ORDER BY SOLICITACAO_VERBA, ID_SOLICITACAO_ITEM
    `);

    // Agrupa por SV — chave é string pra serializar JSON limpo.
    const saldos: Record<
      string,
      {
        svNumber: string;
        itens: Array<{
          idItem: string;
          valorSolicitado: number;
          valorAPagar: number;
          valorAPagarCalc: number;
          vencimentoReal: Date | null;
        }>;
        totalSolicitado: number;
        totalAPagar: number;
      }
    > = {};

    for (const r of rows) {
      const key = String(r.SOLICITACAO_VERBA);
      const valSolic = Number(r.VALOR_SOLICITADO);
      const valPagar = Number(r.VALOR_A_PAGAR);
      const valPagarCalc = Number(r.VALOR_A_PAGAR_CALC);
      if (!saldos[key]) {
        saldos[key] = {
          svNumber: key,
          itens: [],
          totalSolicitado: 0,
          totalAPagar: 0,
        };
      }
      saldos[key].itens.push({
        idItem: r.ID_SOLICITACAO_ITEM,
        valorSolicitado: valSolic,
        valorAPagar: valPagar,
        valorAPagarCalc: valPagarCalc,
        vencimentoReal: r.VENCIMENTO_REAL,
      });
      saldos[key].totalSolicitado += valSolic;
      saldos[key].totalAPagar += valPagar;
    }

    return { saldos };
  }
}
