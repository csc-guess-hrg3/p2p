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
