import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderStatus } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';

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
  constructor(private readonly prisma: PrismaService) {}

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

  private openWhere(companyIds: string[]): Prisma.PurchaseOrderWhereInput {
    return {
      deletedAt: null,
      companyId: { in: companyIds },
      status: { notIn: FINALIZED_PO_STATUS },
    };
  }

  private overdueWhere(companyIds: string[]): Prisma.PurchaseOrderWhereInput {
    return {
      ...this.openWhere(companyIds),
      expectedDelivery: { lt: new Date() },
    };
  }

  /** Resumo com os 3 KPIs. */
  async summary(user: AuthenticatedUser, companyId?: string) {
    const companyIds = this.resolveScope(user, companyId);

    const [open, overdue, budget] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: this.openWhere(companyIds),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: this.overdueWhere(companyIds),
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.budgetConsumption(user, companyId),
    ]);

    const openAmount = Number(open._sum.totalAmount ?? 0);
    const overdueAmount = Number(overdue._sum.totalAmount ?? 0);

    return {
      // KPI 1 — Pedidos em aberto
      openOrders: {
        count: open._count,
        totalAmount: openAmount,
      },
      // KPI 2 — Pedidos em atraso (entrega vencida, ainda não finalizado)
      overdueOrders: {
        count: overdue._count,
        totalAmount: overdueAmount,
        // % do volume (valor) em aberto que está atrasado — meta PRD ≤ 5%
        pctOfOpenVolume:
          openAmount > 0
            ? Number(((overdueAmount / openAmount) * 100).toFixed(2))
            : 0,
      },
      // KPI 3 — Consumo orçamentário do mês corrente
      budgetConsumption: budget.totals,
    };
  }

  /** Drill-down: pedidos em aberto. */
  async openOrders(user: AuthenticatedUser, companyId?: string) {
    const companyIds = this.resolveScope(user, companyId);
    return this.prisma.purchaseOrder.findMany({
      where: this.openWhere(companyIds),
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { buyer: { select: { id: true, name: true } } },
    });
  }

  /** Drill-down: pedidos em atraso. */
  async overdueOrders(user: AuthenticatedUser, companyId?: string) {
    const companyIds = this.resolveScope(user, companyId);
    return this.prisma.purchaseOrder.findMany({
      where: this.overdueWhere(companyIds),
      orderBy: { expectedDelivery: 'asc' },
      take: 200,
      include: { buyer: { select: { id: true, name: true } } },
    });
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
  ): Promise<Array<{ year: number; month: number; count: number; total: number }>> {
    const companyIds = this.resolveScope(user, companyId);
    const now = new Date();
    const since = new Date(
      now.getFullYear(),
      now.getMonth() - (months - 1),
      1,
    );
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
        createdAt: { gte: since },
      },
      select: { createdAt: true, totalAmount: true },
    });

    // Bucketiza por (year,month). Inicializa todos os meses no range pra
    // não pular nenhum no gráfico, mesmo que sem pedidos.
    const buckets = new Map<string, { count: number; total: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
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
  async topSuppliers(
    user: AuthenticatedUser,
    companyId?: string,
    limit = 10,
  ) {
    const companyIds = this.resolveScope(user, companyId);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierName'],
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
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
    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: {
        deletedAt: null,
        companyId: { in: companyIds },
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

    // 1) Aprovações pendentes do próprio usuário (qualquer doc).
    const approvalsPending = await this.prisma.approvalStep.count({
      where: {
        assignedApproverId: user.id,
        status: 'PENDING',
        companyId: { in: companyIds },
      },
    });

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

    return {
      approvalsPending,
      paPending,
      fiscalPending,
      myDraftRequisitions,
    };
  }

  /**
   * KPI 3 — Consumo orçamentário do mês corrente, por centro de custo.
   * Lê BudgetEntry (orçamento lançado); o controle orçamentário completo
   * é da Fase 2. Retorna os totais e o detalhamento por CC.
   */
  async budgetConsumption(user: AuthenticatedUser, companyId?: string) {
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
