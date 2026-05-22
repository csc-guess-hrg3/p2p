import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PurchaseOrderStatus } from '../common/enums';

/**
 * Relatórios MVP do PRD § 13.
 *
 * Apenas REL-001/002/003 são implementáveis no MVP — os demais
 * (DDAs, provisões, adiantamentos, matching fiscal) dependem do
 * módulo Financeiro / Documentos Fiscais que ainda não tem dados
 * (Fase 2 do roadmap).
 *
 * Todos os relatórios devolvem array JSON puro — a serialização CSV
 * é feita no frontend pra não duplicar lógica nem precisar de lib
 * de Excel no backend.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(user: AuthenticatedUser, companyId?: string): string[] {
    if (companyId) {
      if (!user.companyIds.includes(companyId)) {
        throw new ForbiddenException('Sem acesso a esta empresa.');
      }
      return [companyId];
    }
    return user.companyIds;
  }

  /**
   * REL-001 — Fornecedores sem CC associado.
   *
   * Lê os fornecedores ativos do ERP (view v_p2p_suppliers) e cruza
   * com os pedidos do P2P pra detectar quais nunca foram usados em
   * pedido COM rateio de centro de custo. Como o vínculo "fornecedor
   * autorizado a CC" do PRD é uma feature futura, aqui interpretamos
   * "sem CC associado" = sem ocorrência em pedidos ainda.
   */
  async suppliersWithoutCostCenter(
    user: AuthenticatedUser,
    companyId?: string,
  ) {
    const companyIds = this.scope(user, companyId);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds }, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    const result: Array<{
      empresa: string;
      codigo: string;
      nome: string;
      cnpj: string | null;
      email: string | null;
      pedidosUltimos90Dias: number;
    }> = [];
    const since = new Date();
    since.setDate(since.getDate() - 90);
    for (const co of companies) {
      const suppliers = await this.prisma.$queryRaw<
        { codigo: string; nome: string; cnpj_cpf: string | null; email: string | null }[]
      >`
        SELECT codigo, nome, cnpj_cpf, email
        FROM dbo.v_p2p_suppliers
        WHERE empresa = ${co.code} AND inativo = 0
        ORDER BY nome`;
      for (const s of suppliers) {
        const count = await this.prisma.purchaseOrder.count({
          where: {
            companyId: co.id,
            supplierErpCode: s.codigo,
            createdAt: { gte: since },
            deletedAt: null,
          },
        });
        if (count === 0) {
          result.push({
            empresa: co.code,
            codigo: s.codigo,
            nome: s.nome,
            cnpj: s.cnpj_cpf,
            email: s.email,
            pedidosUltimos90Dias: 0,
          });
        }
      }
    }
    return result;
  }

  /**
   * REL-002 — Pedidos em atraso > 30 dias.
   *
   * PRD pede "diário" mas o relatório responde ad-hoc por enquanto.
   * Considera atraso = expectedDelivery + 30 dias < hoje, em pedido
   * ainda aberto (não recebido total, não cancelado, não integrado).
   */
  async overdueOrdersOver30Days(
    user: AuthenticatedUser,
    companyId?: string,
  ) {
    const companyIds = this.scope(user, companyId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
        status: {
          notIn: [
            PurchaseOrderStatus.FULLY_RECEIVED,
            PurchaseOrderStatus.CANCELLED,
            PurchaseOrderStatus.INTEGRATED,
          ],
        },
        expectedDelivery: { not: null, lt: cutoff },
      },
      select: {
        id: true,
        number: true,
        supplierName: true,
        branchName: true,
        status: true,
        totalAmount: true,
        expectedDelivery: true,
        createdAt: true,
        buyer: { select: { name: true } },
      },
      orderBy: { expectedDelivery: 'asc' },
    });
    return orders.map((po) => ({
      empresa: companyIds.length > 1 ? '(múltiplas)' : '',
      numero: po.number,
      fornecedor: po.supplierName,
      filial: po.branchName,
      comprador: po.buyer?.name ?? null,
      status: po.status,
      valor: Number(po.totalAmount),
      entregaPrevista: po.expectedDelivery,
      diasAtraso: po.expectedDelivery
        ? Math.floor(
            (Date.now() - new Date(po.expectedDelivery).getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null,
      criadoEm: po.createdAt,
    }));
  }

  /**
   * REL-003 — Consumo orçamentário por Filial × CC.
   *
   * Mês de referência: o atual (default) ou explícito via params.
   * Lê BudgetEntry direto — o controle orçamentário real é Fase 2,
   * então `committed`/`consumed` aqui refletem apenas o que foi
   * carregado manualmente.
   */
  async budgetByBranchCostCenter(
    user: AuthenticatedUser,
    companyId?: string,
    year?: number,
    month?: number,
  ) {
    const companyIds = this.scope(user, companyId);
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const where: Prisma.BudgetEntryWhereInput = {
      companyId: { in: companyIds },
      year: y,
      month: m,
    };
    const entries = await this.prisma.budgetEntry.findMany({
      where,
      orderBy: [{ branchErpCode: 'asc' }, { costCenterErpCode: 'asc' }],
    });
    return entries.map((e) => {
      const budgeted = Number(e.amountBudgeted);
      const committed = Number(e.amountCommitted);
      const consumed = Number(e.amountConsumed);
      return {
        ano: e.year,
        mes: e.month,
        filial: e.branchErpCode,
        centroCusto: e.costCenterErpCode,
        orcado: budgeted,
        comprometido: committed,
        consumido: consumed,
        pctConsumido:
          budgeted > 0 ? Number(((consumed / budgeted) * 100).toFixed(2)) : 0,
        saldo: budgeted - consumed,
      };
    });
  }
}
