import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderStatus, UserProfile } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { ApprovalsService } from '../approvals/approvals.service';

// Status que encerram o pedido — fora do conjunto "em aberto".
const FINALIZED_PO_STATUS: string[] = [
  PurchaseOrderStatus.FULLY_RECEIVED,
  PurchaseOrderStatus.CANCELLED,
  PurchaseOrderStatus.INTEGRATED,
];

/**
 * Dashboard — 3 KPIs core do MVP (PRD Seção 16.1):
 * pedidos em aberto, pedidos em atraso e consumo orçamentário.
 * Escopo por empresa do usuário (escopo por filial/CC fica para a Fase 2).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
  ) {}

  /** Resolve o conjunto de empresas a consultar. */
  private resolveScope(user: AuthenticatedUser, companyId?: string): string[] {
    if (companyId) {
      if (!user.companyIds.includes(companyId)) {
        throw new ForbiddenException('Sem acesso a esta empresa.');
      }
      return [companyId];
    }
    return user.companyIds;
  }

  /**
   * Filtro de Pedido do dashboard — SEMPRE own-only (decisão PO: "own-only em
   * tudo", inclusive gestor/admin; os de outros, via SIMULAÇÃO). Não há mais
   * escopo 'equipe'/'todos'. 'mine' = sou o COMPRADOR (buyerId) OU o SOLICITANTE
   * da requisição de origem — é a mesma compra. O parâmetro `requested` do
   * frontend é ignorado por segurança.
   */
  private resolvePoScope(user: AuthenticatedUser): {
    scope: 'mine';
    where: Prisma.PurchaseOrderWhereInput;
  } {
    return {
      scope: 'mine',
      where: {
        OR: [
          { buyerId: user.id },
          { requisition: { requesterId: user.id } },
        ],
      },
    };
  }

  private openWhere(
    companyIds: string[],
    scopeWhere: Prisma.PurchaseOrderWhereInput = {},
  ): Prisma.PurchaseOrderWhereInput {
    return {
      deletedAt: null,
      companyId: { in: companyIds },
      status: { notIn: FINALIZED_PO_STATUS },
      ...scopeWhere,
    };
  }

  private overdueWhere(
    companyIds: string[],
    scopeWhere: Prisma.PurchaseOrderWhereInput = {},
  ): Prisma.PurchaseOrderWhereInput {
    return {
      ...this.openWhere(companyIds, scopeWhere),
      expectedDelivery: { lt: new Date() },
    };
  }

  /** Resumo com os KPIs, escopados por papel. */
  async summary(
    user: AuthenticatedUser,
    companyId?: string,
    _requestedScope?: 'mine' | 'team' | 'all', // ignorado (own-only em tudo)
  ) {
    const companyIds = this.resolveScope(user, companyId);
    const { scope, where } = this.resolvePoScope(user);
    // Orçamento é métrica de EMPRESA (não pedido de ninguém) — segue como KPI
    // do admin. Não vaza pedidos de outros; a checagem de papel vive em
    // budgetConsumption(). Operador/gestor não recebem.
    const wantBudget = user.profile === UserProfile.ADMIN;

    const [open, overdue, budget] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: this.openWhere(companyIds, where),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: this.overdueWhere(companyIds, where),
        _count: true,
        _sum: { totalAmount: true },
      }),
      wantBudget
        ? this.budgetConsumption(user, companyId)
        : Promise.resolve(null),
    ]);

    const openAmount = Number(open._sum.totalAmount ?? 0);
    const overdueAmount = Number(overdue._sum.totalAmount ?? 0);

    return {
      scope, // escopo efetivo (pode ter sido rebaixado pelo papel)
      openOrders: {
        count: open._count,
        totalAmount: openAmount,
      },
      overdueOrders: {
        count: overdue._count,
        totalAmount: overdueAmount,
        pctOfOpenVolume:
          openAmount > 0
            ? Number(((overdueAmount / openAmount) * 100).toFixed(2))
            : 0,
      },
      // Só na visão consolidada (admin). null nos demais.
      budgetConsumption: budget ? budget.totals : null,
    };
  }

  /** Drill-down: pedidos em aberto (escopado). */
  async openOrders(
    user: AuthenticatedUser,
    companyId?: string,
    _requestedScope?: 'mine' | 'team' | 'all', // ignorado (own-only em tudo)
  ) {
    const companyIds = this.resolveScope(user, companyId);
    const { where } = this.resolvePoScope(user);
    return this.prisma.purchaseOrder.findMany({
      where: this.openWhere(companyIds, where),
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        number: true,
        supplierName: true,
        branchName: true,
        status: true,
        totalAmount: true,
        expectedDelivery: true,
        createdAt: true,
        buyer: { select: { id: true, name: true } },
      },
    });
  }

  /** Drill-down: pedidos em atraso (escopado). */
  async overdueOrders(
    user: AuthenticatedUser,
    companyId?: string,
    _requestedScope?: 'mine' | 'team' | 'all', // ignorado (own-only em tudo)
  ) {
    const companyIds = this.resolveScope(user, companyId);
    const { where } = this.resolvePoScope(user);
    return this.prisma.purchaseOrder.findMany({
      where: this.overdueWhere(companyIds, where),
      orderBy: { expectedDelivery: 'asc' },
      take: 200,
      select: {
        id: true,
        number: true,
        supplierName: true,
        branchName: true,
        status: true,
        totalAmount: true,
        expectedDelivery: true,
        createdAt: true,
        buyer: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Visão consolidada por EQUIPE (só admin) — em aberto e em atraso por
   * equipe da requisição de origem. Para a dimensão "Por equipe" do admin.
   */
  async byTeam(user: AuthenticatedUser, companyId?: string) {
    if (user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Visão por equipe é exclusiva de admin.');
    }
    const companyIds = this.resolveScope(user, companyId);
    const rows = await this.prisma.purchaseOrder.findMany({
      where: this.openWhere(companyIds),
      select: {
        totalAmount: true,
        expectedDelivery: true,
        requisition: {
          select: { teamId: true, team: { select: { name: true } } },
        },
      },
    });
    const now = new Date();
    const map = new Map<
      string,
      {
        teamId: string | null;
        teamName: string;
        openCount: number;
        openAmount: number;
        overdueCount: number;
        overdueAmount: number;
      }
    >();
    for (const po of rows) {
      const teamId = po.requisition?.teamId ?? null;
      const key = teamId ?? '__none__';
      const teamName = po.requisition?.team?.name ?? 'Sem equipe';
      const e = map.get(key) ?? {
        teamId,
        teamName,
        openCount: 0,
        openAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
      };
      const amt = Number(po.totalAmount);
      e.openCount += 1;
      e.openAmount += amt;
      if (po.expectedDelivery && po.expectedDelivery < now) {
        e.overdueCount += 1;
        e.overdueAmount += amt;
      }
      map.set(key, e);
    }
    return {
      byTeam: Array.from(map.values()).sort(
        (a, b) => b.openAmount - a.openAmount,
      ),
    };
  }

  /**
   * Tendência de pedidos criados nos últimos N meses (default 6).
   * Para o gráfico de área no Dashboard — mostra volume (#pedidos) e
   * valor por mês. Inclui PA (PurchaseOrder + PA via integração — por
   * enquanto, só PurchaseOrder).
   */
  async ordersByMonth(
    user: AuthenticatedUser,
    companyId?: string,
    months = 6,
  ): Promise<
    Array<{ year: number; month: number; count: number; total: number }>
  > {
    const companyIds = this.resolveScope(user, companyId);
    // Own-only para TODOS (inclusive admin) — mesmo recorte dos demais KPIs.
    // Sem isto o agregado somava pedidos de todos os donos p/ qualquer operador
    // (achado da revisão own-only). NÃO reintroduzir escopo equipe/all aqui.
    const { where: scopeWhere } = this.resolvePoScope(user);
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
        ...scopeWhere,
        createdAt: { gte: since },
      },
      select: { createdAt: true, totalAmount: true },
    });

    // Bucketiza por (year,month). Inicializa todos os meses no range pra
    // não pular nenhum no gráfico, mesmo que sem pedidos.
    const buckets = new Map<string, { count: number; total: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(
        now.getFullYear(),
        now.getMonth() - (months - 1 - i),
        1,
      );
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      buckets.set(key, { count: 0, total: 0 });
    }
    for (const o of orders) {
      const key = `${o.createdAt.getFullYear()}-${o.createdAt.getMonth() + 1}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.count += 1;
      b.total += Number(o.totalAmount);
    }
    return Array.from(buckets.entries()).map(([k, v]) => {
      const [y, m] = k.split('-').map(Number);
      return { year: y, month: m, count: v.count, total: v.total };
    });
  }

  /**
   * Top fornecedores do mês corrente por valor total comprado.
   * Mês corrente em vez de janela móvel pra alinhar com o KPI orçamentário.
   */
  async topSuppliers(user: AuthenticatedUser, companyId?: string, limit = 10) {
    const companyIds = this.resolveScope(user, companyId);
    const { where: scopeWhere } = this.resolvePoScope(user);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierName'],
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
        ...scopeWhere,
        createdAt: { gte: start, lt: end },
      },
      _count: true,
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({
      supplier: g.supplierName,
      count: g._count,
      total: Number(g._sum.totalAmount ?? 0),
    }));
  }

  /**
   * Distribuição de pedidos por status — visão "donut" da carteira.
   * Considera todos os pedidos ativos (não-deletados) para visualização.
   */
  async ordersByStatus(user: AuthenticatedUser, companyId?: string) {
    const companyIds = this.resolveScope(user, companyId);
    const { where: scopeWhere } = this.resolvePoScope(user);
    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
        ...scopeWhere,
      },
      _count: true,
      _sum: { totalAmount: true },
    });
    return grouped.map((g) => ({
      status: g.status,
      count: g._count,
      total: Number(g._sum.totalAmount ?? 0),
    }));
  }

  /**
   * "Minhas ações pendentes" — feed customizado por usuário:
   *  - requisições do usuário aguardando classificação fiscal
   *  - aprovações pendentes do usuário (PC, requisição)
   *  - pedidos PA aguardando sua aprovação (se for o aprovador da empresa)
   *  - pendências fiscais que envolvam itens dele
   */
  async myActions(user: AuthenticatedUser, companyId?: string) {
    const companyIds = this.resolveScope(user, companyId);

    // 1) Aprovações pendentes do próprio usuário (qualquer doc). Reusa a MESMA
    //    lógica da fila /aprovacoes (pendingForUser) — cobre aprovador fixo,
    //    delegado e por CARGO (+ filial) e o nível ativo; o antigo count por
    //    assignedApproverId só via o fixo e destoava do badge (F1).
    const approvalsPending = (await this.approvals.pendingForUser(user)).length;

    // 2) Pedidos PA da empresa aguardando aprovação (só se ele é o
    //    paApproverUserId em alguma das empresas em escopo).
    const cfg = await this.prisma.companyErpConfig.findFirst({
      where: { companyId: { in: companyIds }, paApproverUserId: user.id },
      include: { company: { select: { code: true } } },
    });
    let paPending = 0;
    if (cfg) {
      const rows = await this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*) AS count FROM dbo.v_p2p_product_orders
        WHERE empresa = ${cfg.company.code} AND status_efetivo = 'E'
          AND emissao >= '2025-01-01'`;
      paPending = Number(rows[0]?.count ?? 0);
    }

    // 3) Pendências fiscais — só pra equipe Fiscal (isFiscal=true);
    //    os demais veem só as próprias.
    const team = user.teamId
      ? await this.prisma.team.findUnique({
          where: { id: user.teamId },
          select: { isFiscal: true },
        })
      : null;
    const fiscalWhere: Prisma.FiscalItemRequestWhereInput = {
      status: 'PENDING',
      companyId: { in: companyIds },
      ...(team?.isFiscal ? {} : { requestedById: user.id }),
    };
    const fiscalPending = await this.prisma.fiscalItemRequest.count({
      where: fiscalWhere,
    });

    // 4) Requisições do próprio usuário ainda em rascunho/rejeitadas
    //    (sinaliza "você tem coisa pra retomar").
    const myDraftRequisitions = await this.prisma.requisition.count({
      where: {
        companyId: { in: companyIds },
        requesterId: user.id,
        status: { in: ['DRAFT', 'REJECTED'] },
        deletedAt: null,
      },
    });

    // 5) Requisições do próprio usuário em aprovação (solicitante quer
    //    saber por onde anda a fila).
    const myInApproval = await this.prisma.requisition.count({
      where: {
        companyId: { in: companyIds },
        requesterId: user.id,
        status: { in: ['SUBMITTED', 'IN_APPROVAL', 'REVISION'] },
        deletedAt: null,
      },
    });

    // 6) Requisições aprovadas aguardando conversão em pedido de compra
    //    (ação do comprador). Escopo por empresa — quem converte atua
    //    sobre requisições aprovadas da empresa, não só as próprias.
    const toConvert = await this.prisma.requisition.count({
      where: {
        companyId: { in: companyIds },
        status: 'APPROVED',
        deletedAt: null,
      },
    });

    return {
      approvalsPending,
      // Só é o aprovador PA quem está configurado em companyErpConfig.
      // O front usa isso pra mostrar "Pedidos PA para aprovar" apenas a ele.
      isPaApprover: !!cfg,
      paPending,
      fiscalPending,
      myDraftRequisitions,
      myInApproval,
      toConvert,
    };
  }

  /**
   * KPI 3 — Consumo orçamentário do mês corrente, por centro de custo.
   * Lê BudgetEntry (orçamento lançado); o controle orçamentário completo
   * é da Fase 2. Retorna os totais e o detalhamento por CC.
   */
  async budgetConsumption(user: AuthenticatedUser, companyId?: string) {
    // Consumo orçamentário consolidado é visão de gestão da empresa: só admin.
    if (user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem ver o consumo orçamentário consolidado.',
      );
    }
    const companyIds = this.resolveScope(user, companyId);
    const now = new Date();
    const where: Prisma.BudgetEntryWhereInput = {
      companyId: { in: companyIds },
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };
    const entries = await this.prisma.budgetEntry.findMany({
      where,
      orderBy: { costCenterErpCode: 'asc' },
    });

    let budgeted = 0;
    let committed = 0;
    let consumed = 0;
    const byCostCenter = entries.map((e) => {
      const b = Number(e.amountBudgeted);
      const cm = Number(e.amountCommitted);
      const cs = Number(e.amountConsumed);
      budgeted += b;
      committed += cm;
      consumed += cs;
      return {
        branchErpCode: e.branchErpCode,
        costCenterErpCode: e.costCenterErpCode,
        budgeted: b,
        committed: cm,
        consumed: cs,
        pctConsumed: b > 0 ? Number(((cs / b) * 100).toFixed(2)) : 0,
      };
    });

    return {
      period: { year: now.getFullYear(), month: now.getMonth() + 1 },
      totals: {
        budgeted,
        committed,
        consumed,
        pctConsumed:
          budgeted > 0 ? Number(((consumed / budgeted) * 100).toFixed(2)) : 0,
      },
      byCostCenter,
    };
  }
}
