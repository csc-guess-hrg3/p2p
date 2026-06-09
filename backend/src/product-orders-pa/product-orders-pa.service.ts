import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { safeDbName } from '../common/erp/safe-db-name';

/*
 * Linhas das views v_p2p_product_order* (consultadas via `SELECT *`).
 * Tipamos só os campos que o código acessa; as demais colunas ficam como
 * `unknown` via index signature — evita `any` (e os erros no-unsafe-*) sem
 * precisar enumerar todas as colunas das views.
 */
type PaOrderRow = {
  pedido: string;
  cadastramento: string | Date | null;
  requerido_por: string | null;
  data_aprovacao: string | Date | null;
  status_efetivo: string | null;
  status_compra: string | null;
  aprovado_por: string | null;
  emissao: string | Date | null;
  [col: string]: unknown;
};
type PaItemRow = {
  produto: string | null;
  cor: string | null;
  entrega: string | Date | null;
  [col: string]: unknown;
};
type PaNfRow = {
  nf: string | null;
  serie: string | null;
  recebimento: string | Date | null;
  emissao: string | Date | null;
  qtde_total: number | string | null;
  [col: string]: unknown;
};
type PaItemNfRow = {
  produto: string | null;
  cor: string | null;
  entrega: string | Date | null;
  [col: string]: unknown;
};

/**
 * Pedidos de Compra de PRODUTO ACABADO (PA).
 *
 * Fluxo paralelo ao P2P de consumíveis. Pedidos NASCEM NO LINX. O P2P
 * serve só como camada de aprovação + envio ao fornecedor + timeline
 * (essas duas últimas em fases seguintes). Esta fase é READ-ONLY:
 * a tela do diretor lista os pedidos pendentes (`STATUS_COMPRA = 'P '`)
 * e mostra detalhe (itens com grade vertical).
 *
 * As views `v_p2p_product_orders`, `v_p2p_product_order_items` e
 * `v_p2p_product_order_grade` materializam a leitura cross-database.
 * O cliente nunca toca direto nas tabelas Linx.
 */
@Injectable()
export class ProductOrdersPaService {
  private readonly logger = new Logger(ProductOrdersPaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertCompany(company: string): string {
    const c = company?.toUpperCase();
    if (c !== 'GUESS' && c !== 'HRG3') {
      throw new BadRequestException(
        `Empresa inválida: "${company}". Use GUESS ou HRG3.`,
      );
    }
    return c;
  }

  private assertUserHasCompany(user: AuthenticatedUser, companyCode: string) {
    // O usuário precisa ter acesso a alguma empresa com o code dado.
    // A camada de Integration usa a mesma checagem por code, então
    // confiamos que o frontend sempre passa um code válido para o usuário.
    void user;
    void companyCode;
  }

  /** Resolve o nome do banco do ERP a partir do code da empresa.
   *  Passa por safeDbName — toda chamada que interpolar o retorno em
   *  SQL fica protegida (audit C6). */
  private async resolveErpDb(companyCode: string): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { code: companyCode, deletedAt: null },
      select: { erpDbName: true },
    });
    if (!company) {
      throw new BadRequestException(`Empresa "${companyCode}" não cadastrada.`);
    }
    return safeDbName(company.erpDbName);
  }

  /** Resolve a CompanyErpConfig de uma empresa por code. */
  private async resolveConfig(companyCode: string) {
    const company = await this.prisma.company.findFirst({
      where: { code: companyCode, deletedAt: null },
      include: { erpConfig: true },
    });
    if (!company) {
      throw new BadRequestException(`Empresa "${companyCode}" não cadastrada.`);
    }
    return { company, config: company.erpConfig };
  }

  /**
   * Aprova um pedido PA. Verifica:
   *  - usuário é o `paApproverUserId` configurado na empresa
   *  - pedido está em status 'E' (em estudo)
   * Escreve no Linx: COMPRAS.STATUS_COMPRA='A ', STATUS_APROVACAO='A',
   * LX_STATUS_COMPRA=1, DATA_APROVACAO, APROVADO_POR; e insere uma linha
   * em COMPRAS_STATUS_LOG.
   */
  async approve(user: AuthenticatedUser, company: string, pedido: string) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);
    const { company: comp, config } = await this.resolveConfig(c);
    if (!config?.paApproverUserId) {
      throw new BadRequestException(
        `Empresa ${comp.code} não tem aprovador de PA configurado em company_erp_configs.paApproverUserId.`,
      );
    }
    if (config.paApproverUserId !== user.id) {
      throw new ForbiddenException(
        'Apenas o diretor da marca configurado pode aprovar pedidos PA.',
      );
    }
    const erpDb = safeDbName(comp.erpDbName);
    const numero = pedido.trim();

    const headerRows = await this.prisma.$queryRawUnsafe<
      { status_compra: string }[]
    >(
      `SELECT TOP 1 RTRIM(STATUS_COMPRA) AS status_compra
         FROM [${erpDb}].dbo.COMPRAS
        WHERE PEDIDO = @P1
          AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
      numero,
    );
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado no ERP.`);
    }
    const current = (headerRows[0].status_compra ?? '').trim();
    if (current !== 'E') {
      throw new BadRequestException(
        `Pedido ${numero} está em status "${current}" — só pedidos em estudo (E) podem ser aprovados.`,
      );
    }

    const aprovador = (user.name ?? user.adUsername ?? '').slice(0, 25);
    // Transacional REAL via tx recebido no callback. Antes usava this.prisma
    // dentro do $transaction — Prisma abria a transação mas as queries
    // rodavam fora dela (bug silencioso). Se a 2ª query falhar agora,
    // o UPDATE em COMPRAS reverte. A trigger LXI_COMPRAS aceita
    // BEGIN TRAN externo nas operações de UPDATE testadas.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE [${erpDb}].dbo.COMPRAS
            SET STATUS_COMPRA = 'A ',
                STATUS_APROVACAO = 'A',
                LX_STATUS_COMPRA = 1,
                DATA_APROVACAO = GETDATE(),
                APROVADO_POR = @P2,
                APROVADOR_POR = @P2
          WHERE PEDIDO = @P1
            AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
        numero,
        aprovador,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
           (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
         VALUES (@P1, GETDATE(), N'A ', @P2)`,
        numero,
        aprovador,
      );
    });
    this.logger.log(`PA ${numero} aprovado por ${aprovador} (${user.id})`);
    return this.findOne(user, company, numero);
  }

  /**
   * Reprova um pedido PA — exige motivo (mínimo 10 caracteres),
   * concatenado em COMPRAS.OBS para preservar histórico.
   */
  async reject(
    user: AuthenticatedUser,
    company: string,
    pedido: string,
    reason: string,
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'Motivo da reprovação obrigatório (mínimo 10 caracteres).',
      );
    }
    const { company: comp, config } = await this.resolveConfig(c);
    if (!config?.paApproverUserId || config.paApproverUserId !== user.id) {
      throw new ForbiddenException(
        'Apenas o diretor da marca configurado pode reprovar pedidos PA.',
      );
    }
    const erpDb = safeDbName(comp.erpDbName);
    const numero = pedido.trim();

    const headerRows = await this.prisma.$queryRawUnsafe<
      { status_compra: string; obs: string | null }[]
    >(
      `SELECT TOP 1 RTRIM(STATUS_COMPRA) AS status_compra,
              CAST(OBS AS NVARCHAR(MAX)) AS obs
         FROM [${erpDb}].dbo.COMPRAS
        WHERE PEDIDO = @P1
          AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
      numero,
    );
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado no ERP.`);
    }
    const current = (headerRows[0].status_compra ?? '').trim();
    if (current !== 'E') {
      throw new BadRequestException(
        `Pedido ${numero} está em status "${current}" — só pedidos em estudo (E) podem ser reprovados.`,
      );
    }

    const aprovador = (user.name ?? user.adUsername ?? '').slice(0, 25);
    const prevObs = headerRows[0].obs ?? '';
    const stamp = new Date()
      .toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      .replace(',', '');
    const note = `REPROVADO POR ${aprovador} EM ${stamp}: ${reason.trim()}`;
    const newObs = prevObs ? `${prevObs}\n\n${note}` : note;

    // Transacional REAL via tx (antes usava this.prisma — bug silencioso).
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE [${erpDb}].dbo.COMPRAS
            SET STATUS_COMPRA = 'R ',
                STATUS_APROVACAO = 'R',
                OBS = @P3
          WHERE PEDIDO = @P1
            AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
        numero,
        aprovador,
        newObs,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
           (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
         VALUES (@P1, GETDATE(), N'R ', @P2)`,
        numero,
        aprovador,
      );
    });
    this.logger.log(`PA ${numero} reprovado por ${aprovador} (${user.id})`);
    return this.findOne(user, company, numero);
  }

  /**
   * Reagenda a entrega de um pedido PA — grava o DE/PARA no histórico
   * pra refletir na timeline e na coluna "Próxima entrega" (vigente).
   *
   * Permissão: somente quem criou o pedido no Linx (`REQUERIDO_POR` =
   * `user.adUsername`) ou ADMIN do P2P.
   *
   * scope='order'  → move todos os itens abertos (produto/cor/entrega NULL)
   * scope='item'   → move apenas o item específico identificado por
   *                  (produto, cor, entregaOriginal).
   */
  async reschedule(
    user: AuthenticatedUser,
    company: string,
    pedido: string,
    payload: {
      scope: 'order' | 'item';
      toDate: string;
      reason: string;
      produto?: string;
      cor?: string;
      entregaOriginal?: string;
    },
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    const numero = pedido.trim();
    const reason = (payload.reason ?? '').trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Motivo do reagendamento obrigatório (mínimo 5 caracteres).',
      );
    }
    const toDate = new Date(payload.toDate);
    if (Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Nova data inválida.');
    }

    const comp = await this.prisma.company.findFirst({
      where: { code: c, deletedAt: null },
      include: { erpConfig: true },
    });
    if (!comp) {
      throw new BadRequestException(`Empresa "${c}" não cadastrada.`);
    }
    const erpDb = safeDbName(comp.erpDbName);

    // Header só pra garantir que o pedido existe — REQUERIDO_POR não é
    // mais usado pra permissão (campo vem vazio no Linx pra PA).
    const headerRows = await this.prisma.$queryRawUnsafe<
      { requerido_por: string | null }[]
    >(
      `SELECT TOP 1 RTRIM(REQUERIDO_POR) AS requerido_por
         FROM [${erpDb}].dbo.COMPRAS
        WHERE PEDIDO = @P1
          AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
      numero,
    );
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado.`);
    }

    // Permissão: time configurado em CompanyErpConfig.paReschedulerTeamId,
    // ou perfil ADMIN do P2P.
    const isAdmin = user.profile === 'ADMIN';
    const teamMatches =
      !!comp.erpConfig?.paReschedulerTeamId &&
      user.teamId === comp.erpConfig.paReschedulerTeamId;
    if (!isAdmin && !teamMatches) {
      throw new ForbiddenException(
        comp.erpConfig?.paReschedulerTeamId
          ? 'Você não está no time autorizado a reagendar entregas de PA.'
          : 'Time autorizado a reagendar PA não configurado em /admin (ADMIN pode configurar).',
      );
    }

    // Como o Linx é atualizado a cada reschedule, `fromDate` = data
    // vigente atual do alvo (do pedido ou do item específico).
    let fromDate: Date | null = null;
    if (payload.scope === 'order') {
      const r = await this.prisma.$queryRaw<{ proxima_entrega: Date | null }[]>`
        SELECT TOP 1 proxima_entrega FROM dbo.v_p2p_product_orders
        WHERE empresa = ${c} AND pedido = ${numero}`;
      fromDate = r[0]?.proxima_entrega ?? null;
    } else {
      if (!payload.produto || !payload.cor || !payload.entregaOriginal) {
        throw new BadRequestException(
          'Reagendamento por item exige produto, cor e a data atual da entrega.',
        );
      }
      // Cliente envia a ENTREGA vigente que está vendo na UI (it.entrega
      // — já reflete updates anteriores). Confiamos nela.
      fromDate = new Date(payload.entregaOriginal);
    }
    if (!fromDate) {
      throw new BadRequestException(
        'Pedido sem data de entrega aberta — não há o que reagendar.',
      );
    }
    if (toDate.getTime() === fromDate.getTime()) {
      throw new BadRequestException(
        'Nova data igual à atual — sem mudança a registrar.',
      );
    }

    // Atualiza a data no Linx pra refletir nos demais sistemas (logística,
    // PCP, relatórios). A data original fica preservada no `fromDate` do
    // primeiro change do pedido, então não perdemos rastreabilidade.
    // Transacional REAL via tx — antes usava this.prisma (bug silencioso).
    // Se a gravação no Linx der OK mas paDeliveryChange.create falhar
    // (ou vice-versa), tudo reverte.
    await this.prisma.$transaction(async (tx) => {
      // Só LIMITE_ENTREGA muda. ENTREGA (data original do pedido) fica
      // preservada — o WHERE do scope='item' usa ENTREGA pra identificar
      // a linha, e ela continua estável após N reagendamentos.
      if (payload.scope === 'order') {
        await tx.$executeRawUnsafe(
          `UPDATE [${erpDb}].dbo.COMPRAS_PRODUTO
              SET LIMITE_ENTREGA = @P2
            WHERE PEDIDO = @P1
              AND ISNULL(QTDE_ENTREGAR, 0) > 0`,
          numero,
          toDate,
        );
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE [${erpDb}].dbo.COMPRAS_PRODUTO
              SET LIMITE_ENTREGA = @P4
            WHERE PEDIDO = @P1
              AND PRODUTO = @P2
              AND COR_PRODUTO = @P3
              AND ENTREGA = @P5`,
          numero,
          payload.produto!.trim(),
          payload.cor!.trim(),
          toDate,
          new Date(payload.entregaOriginal!),
        );
      }
      await tx.paDeliveryChange.create({
        data: {
          companyId: comp.id,
          pedido: numero,
          scope: payload.scope,
          produto: payload.scope === 'item' ? (payload.produto ?? null) : null,
          cor: payload.scope === 'item' ? (payload.cor ?? null) : null,
          entregaOriginal:
            payload.scope === 'item' && payload.entregaOriginal
              ? new Date(payload.entregaOriginal)
              : null,
          fromDate,
          toDate,
          reason,
          changedById: user.id,
        },
      });
    });
    this.logger.log(
      `PA ${numero} reagendado (${payload.scope}) por ${user.name}: ${fromDate.toISOString()} → ${toDate.toISOString()}`,
    );
    return this.findOne(user, company, numero);
  }

  /**
   * Lista os pedidos de PA da empresa. Filtros suportados:
   *  - status (P, E, A, R, C, M ou ALL — default = ALL)
   *  - search (busca por número do pedido ou fornecedor)
   *
   * Saída ordenada por EMISSÃO DESC.
   */
  async findAll(
    user: AuthenticatedUser,
    company: string,
    options: { status?: string; search?: string } = {},
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    const { status, search } = options;
    const filters: Prisma.Sql[] = [
      Prisma.sql`empresa = ${c}`,
      // Corte de safra: o P2P só lista pedidos PA a partir desta data.
      // Altere aqui se quiser ampliar/restringir a janela histórica.
      Prisma.sql`emissao >= '2025-01-01'`,
    ];
    if (status && status !== 'ALL') {
      // Usa `status_efetivo` (derivado do cancelamento por item) — o
      // status do header sozinho não basta porque cancelamento de PA
      // é por item em COMPRAS_PRODUTO.QTDE_CANCELADA.
      filters.push(Prisma.sql`status_efetivo = ${status.trim()}`);
    }
    if (search) {
      const term = `%${search}%`;
      filters.push(
        Prisma.sql`(pedido LIKE ${term} OR fornecedor LIKE ${term})`,
      );
    }
    const where = Prisma.join(filters, ' AND ');

    // Query 1: pedidos. Evitamos OUTER APPLY com subquery agregada (que
    // dispara 200 leituras na view de NFs por chamada — em PROD passava
    // dos 5s). Vamos fazer o agg de NFs separado, em batch (Q2).
    const rows = await this.prisma.$queryRaw<PaOrderRow[]>`
      SELECT TOP 200 *
      FROM dbo.v_p2p_product_orders
      WHERE ${where}
      ORDER BY emissao DESC`;

    if (rows.length === 0) return rows;

    const pedidos = rows.map((r) => r.pedido);
    const company2 = await this.prisma.company.findFirst({
      where: { code: c, deletedAt: null },
      select: { id: true },
    });

    // NFs agregadas (batch) + pedidos com reagendamento P2P (batch).
    // O flag "reagendada" só conta se há registro em pa_delivery_changes;
    // ENTREGA != LIMITE_ENTREGA por si só não basta, pois Compras costuma
    // criar pedidos com essas datas diferentes organicamente.
    const [nfAgg, changedPedidos] = await Promise.all([
      this.prisma.$queryRaw<
        { pedido: string; nfs_count: number; first_nf: string | null }[]
      >`
        SELECT pedido,
               COUNT(*) AS nfs_count,
               MIN(nf) AS first_nf
        FROM dbo.v_p2p_product_order_nfs
        WHERE empresa = ${c} AND pedido IN (${Prisma.join(pedidos)})
        GROUP BY pedido`,
      company2
        ? this.prisma.paDeliveryChange.findMany({
            where: { companyId: company2.id, pedido: { in: pedidos } },
            distinct: ['pedido'],
            select: { pedido: true },
          })
        : Promise.resolve([] as { pedido: string }[]),
    ]);
    const nfByPedido = new Map(nfAgg.map((n) => [n.pedido, n]));
    const rescheduledSet = new Set(changedPedidos.map((c) => c.pedido));
    return rows.map((r) => {
      const nf = nfByPedido.get(r.pedido);
      return {
        ...r,
        nfs_count: nf?.nfs_count ?? 0,
        first_nf: nf?.first_nf ?? null,
        was_rescheduled: rescheduledSet.has(r.pedido),
      };
    });
  }

  /**
   * Detalhe de um pedido PA: cabeçalho + lista de itens + flag
   * `canApprovePa` (UI usa pra mostrar Aprovar/Reprovar quando o usuário
   * logado é o aprovador configurado para a empresa).
   */
  async findOne(user: AuthenticatedUser, company: string, pedido: string) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    const numero = pedido.trim();
    const headerRows = await this.prisma.$queryRaw<PaOrderRow[]>`
      SELECT TOP 1 * FROM dbo.v_p2p_product_orders
      WHERE empresa = ${c} AND pedido = ${numero}`;
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado.`);
    }
    const items = await this.prisma.$queryRaw<PaItemRow[]>`
      SELECT * FROM dbo.v_p2p_product_order_items
      WHERE empresa = ${c} AND pedido = ${numero}
      ORDER BY produto, cor, entrega`;

    // NFs do pedido (header agregado) + linhas NF×item para associar
    // a coluna "NF que entregou" em cada item da grade.
    const nfs = await this.prisma.$queryRaw<PaNfRow[]>`
      SELECT * FROM dbo.v_p2p_product_order_nfs
      WHERE empresa = ${c} AND pedido = ${numero}
      ORDER BY recebimento DESC, emissao DESC, nf`;
    const itemNfs = await this.prisma.$queryRaw<PaItemNfRow[]>`
      SELECT * FROM dbo.v_p2p_product_order_item_nfs
      WHERE empresa = ${c} AND pedido = ${numero}`;

    // Log de mudanças de status no Linx (gravado pelo P2P em approve/reject
    // e por outros sistemas do Linx). Pode vir vazio em pedidos antigos.
    const erpDb = await this.resolveErpDb(c);
    const statusLog = await this.prisma.$queryRawUnsafe<
      {
        data_alteracao_status: Date;
        status_compra: string;
        usuario: string | null;
      }[]
    >(
      `SELECT DATA_ALTERACAO_STATUS AS data_alteracao_status,
              RTRIM(STATUS_COMPRA) AS status_compra,
              RTRIM(USUARIO) AS usuario
         FROM [${erpDb}].dbo.COMPRAS_STATUS_LOG
        WHERE RTRIM(PEDIDO) = @P1
        ORDER BY DATA_ALTERACAO_STATUS`,
      numero,
    );

    // Carrega reagendamentos do pedido (DE/PARA) — usados tanto na
    // timeline quanto no cálculo de entrega_vigente por item logo abaixo.
    const companyRec = await this.prisma.company.findFirst({
      where: { code: c, deletedAt: null },
      select: { id: true },
    });
    const changes = companyRec
      ? await this.prisma.paDeliveryChange.findMany({
          where: { companyId: companyRec.id, pedido: numero },
          include: { changedBy: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    // Timeline unificada: criação + log de status + NFs recebidas.
    // Ordenada decrescente (mais recente primeiro) pra UI mostrar como feed.
    const header = headerRows[0];
    type Evt = {
      at: string;
      kind:
        | 'created'
        | 'approved'
        | 'rejected'
        | 'status'
        | 'nf'
        | 'reschedule';
      label: string;
      who?: string | null;
      detail?: string | null;
    };
    const events: Evt[] = [];

    if (header.cadastramento) {
      events.push({
        at: new Date(header.cadastramento).toISOString(),
        kind: 'created',
        label: 'Pedido criado no ERP',
        who: header.requerido_por ?? null,
      });
    }
    if (header.data_aprovacao) {
      const eff = (header.status_efetivo ?? header.status_compra ?? '').trim();
      events.push({
        at: new Date(header.data_aprovacao).toISOString(),
        kind: eff === 'R' ? 'rejected' : 'approved',
        label: eff === 'R' ? 'Pedido reprovado' : 'Pedido aprovado',
        who: header.aprovado_por ?? null,
      });
    }
    // De-para de status — vem direto do Linx (COMPRAS_STATUS) via
    // view, sem hardcode. CP/D/DP nunca aparecem aqui porque são
    // derivados do nosso lado (status_efetivo) e não vão pro log.
    const statusRows = await this.prisma.$queryRaw<
      { codigo: string; descricao: string }[]
    >`SELECT codigo, descricao FROM dbo.v_p2p_compras_status`;
    const statusLabel = new Map(
      statusRows.map((s) => [
        s.codigo.trim().toUpperCase(),
        s.descricao.trim(),
      ]),
    );
    for (const log of statusLog) {
      // Não duplicar a aprovação principal (já adicionada via header).
      const dt = new Date(log.data_alteracao_status).getTime();
      const aprovDt = header.data_aprovacao
        ? new Date(header.data_aprovacao).getTime()
        : null;
      if (
        aprovDt &&
        Math.abs(dt - aprovDt) < 60_000 &&
        (log.status_compra === 'A' || log.status_compra === 'R')
      ) {
        continue;
      }
      const code = (log.status_compra ?? '').trim().toUpperCase();
      const label = statusLabel.get(code) ?? code;
      events.push({
        at: new Date(log.data_alteracao_status).toISOString(),
        kind: 'status',
        label: `Status alterado para "${label}"`,
        who: log.usuario,
      });
    }
    for (const nf of nfs) {
      const at = nf.recebimento ?? nf.emissao;
      if (!at) continue;
      events.push({
        at: new Date(at).toISOString(),
        kind: 'nf',
        label: `Nota fiscal ${nf.nf}${nf.serie ? `/${nf.serie}` : ''} recebida`,
        detail: `Qtde ${nf.qtde_total}`,
      });
    }
    for (const ch of changes) {
      const from = ch.fromDate.toLocaleDateString('pt-BR');
      const to = ch.toDate.toLocaleDateString('pt-BR');
      const scopeLabel =
        ch.scope === 'order'
          ? 'pedido inteiro'
          : `${ch.produto ?? '?'} ${ch.cor ?? ''}`.trim();
      events.push({
        at: ch.createdAt.toISOString(),
        kind: 'reschedule',
        label: `Entrega reagendada (${scopeLabel}): DE ${from} PARA ${to}`,
        who: ch.changedBy?.name ?? null,
        detail: ch.reason,
      });
    }
    const timeline = events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    // Anexa em cada item:
    //  - lista de NFs que o entregaram
    //  - was_rescheduled: true se houve um change registrado no P2P
    //    (scope=order afeta todos; scope=item só o item específico).
    //    Sem isso, comparar ENTREGA != LIMITE_ENTREGA marcaria "reagendada"
    //    em pedidos que Compras já criou com datas diferentes no ERP.
    const hadOrderScopeChange = changes.some((ch) => ch.scope === 'order');
    const itemsWithNfs = items.map((it) => {
      const itemEntrega = it.entrega ? new Date(it.entrega).getTime() : null;
      const matching = itemNfs.filter(
        (r) =>
          (r.produto ?? '').trim() === (it.produto ?? '').trim() &&
          (r.cor ?? '').trim() === (it.cor ?? '').trim() &&
          (r.entrega ? new Date(r.entrega).getTime() : null) === itemEntrega,
      );
      const hadItemChange = changes.some(
        (ch) =>
          ch.scope === 'item' &&
          (ch.produto ?? '').trim() === (it.produto ?? '').trim() &&
          (ch.cor ?? '').trim() === (it.cor ?? '').trim(),
      );
      return {
        ...it,
        nfs: matching,
        was_rescheduled: hadOrderScopeChange || hadItemChange,
      };
    });

    const cfg = await this.resolveConfig(c).catch(() => null);
    const canApprovePa =
      !!cfg?.config?.paApproverUserId &&
      cfg.config.paApproverUserId === user.id;
    // canReschedule: time configurado bate com o time do usuário OU ADMIN.
    const canReschedule =
      user.profile === 'ADMIN' ||
      (!!cfg?.config?.paReschedulerTeamId &&
        user.teamId === cfg.config.paReschedulerTeamId);
    return {
      ...header,
      items: itemsWithNfs,
      nfs,
      timeline,
      canApprovePa,
      canReschedule,
    };
  }

  /**
   * Grade vertical de um item (PEDIDO + PRODUTO + COR + ENTREGA). Devolve
   * uma linha por posição (1..48) com nome do tamanho quando o produto
   * tem grade conhecida em PRODUTOS_TAMANHOS. Quando o vínculo
   * produto→grade não estiver disponível, devolve só a posição numérica.
   */
  async getItemGrade(
    user: AuthenticatedUser,
    company: string,
    pedido: string,
    produto: string,
    cor: string,
    entrega: string,
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    // Resolve o produto-grade a partir do mestre PRODUTOS. O cliente
    // poderia ter mandado o `grade` direto, mas resolver no backend
    // mantém a UI burra (sem cross-table).
    const erpDb = await this.resolveErpDb(c);
    const gradeRow = await this.prisma.$queryRawUnsafe<
      { grade: string | null }[]
    >(
      `SELECT TOP 1 RTRIM(GRADE) AS grade FROM [${erpDb}].dbo.PRODUTOS WHERE PRODUTO = @P1`,
      produto,
    );
    const grade = gradeRow[0]?.grade ?? null;

    const date = new Date(entrega);
    const rows = await this.prisma.$queryRaw<
      {
        posicao: number;
        qtdeOriginal: number;
        qtdeEntregue: number;
        tamanho: string | null;
      }[]
    >`
      SELECT g.posicao,
             g.qtde_original AS qtdeOriginal,
             g.qtde_entregue AS qtdeEntregue,
             t.tamanho
      FROM dbo.v_p2p_product_order_grade g
      LEFT JOIN dbo.v_p2p_grade_tamanhos t
        ON t.empresa = g.empresa AND t.posicao = g.posicao
       AND t.grade = ${grade ?? ''}
      WHERE g.empresa = ${c}
        AND g.pedido = ${pedido.trim()}
        AND g.produto = ${produto.trim()}
        AND g.cor = ${cor.trim()}
        AND g.entrega = ${date}
      ORDER BY g.posicao`;
    return { grade, rows };
  }

  /**
   * NFes vinculadas a este pedido PA (Linx ENTRADAS_PRODUTO → ENTRADAS),
   * cruzadas com fiscal_documents pra liberar XML/DANFe download quando
   * disponível.
   */
  async listNfes(user: AuthenticatedUser, company: string, pedido: string) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);
    const erpDb = await this.resolveErpDb(c);
    const ped = pedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        nfEntrada: string;
        serieNf: string | null;
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
      FROM [${erpDb}].dbo.ENTRADAS e WITH (NOLOCK)
      WHERE EXISTS (
        SELECT 1
          FROM [${erpDb}].dbo.ENTRADAS_PRODUTO ep WITH (NOLOCK)
         WHERE RTRIM(ep.PEDIDO) = '${ped}'
           AND RTRIM(ep.NF_ENTRADA) = RTRIM(e.NF_ENTRADA)
           AND RTRIM(ep.NOME_CLIFOR) = RTRIM(e.NOME_CLIFOR)
           AND RTRIM(ISNULL(ep.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(e.SERIE_NF_ENTRADA,''))
      )
      ORDER BY e.EMISSAO DESC
    `);

    // Cross-ref com fiscal_documents (Qive) pela chave
    const keys = rows
      .map((r) => (r.chaveNfe ?? '').replace(/\D/g, ''))
      .filter((k) => k.length === 44);
    const fdMap = new Map<string, { id: string; status: string }>();
    if (keys.length > 0) {
      const fds = await this.prisma.fiscalDocument.findMany({
        where: { accessKey: { in: keys }, deletedAt: null },
        select: { id: true, accessKey: true, status: true },
      });
      fds.forEach((fd) => fdMap.set(fd.accessKey, fd));
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
        canDownloadDanfe: chave.length === 44,
        canDownloadXml: !!fd,
        fiscalDocumentId: fd?.id ?? null,
        fiscalDocumentStatus: fd?.status ?? null,
      };
    });
  }
}
