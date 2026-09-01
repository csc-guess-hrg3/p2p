import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpsertBudgetEntryDto } from './dto/upsert-budget-entry.dto';
import { SetBudgetConfigDto } from './dto/set-budget-config.dto';

/** Uma célula de orçamento: filial × CC × ano/mês, com orçado × comprometido. */
export interface BudgetCell {
  branchErpCode: string;
  costCenterErpCode: string;
  year: number;
  month: number;
  budgeted: number;
  committed: number;
  available: number;
  exceeded: boolean;
}

export interface BudgetConfig {
  companyId: string;
  enabled: boolean;
  policy: 'INFORMATIVE' | 'BLOCKING';
}

/**
 * Controle Orçamentário (André/OBS-03). Fase atual: configuração da política
 * (INFORMATIVE/BLOCKING) + cadastro manual do orçamento por filial × CC ×
 * ano/mês (BudgetEntry). A avaliação de consumo/estouro (expansão de rateio)
 * entra em seguida, conforme RN-ORC-02.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  private assertCompany(user: AuthenticatedUser, companyId: string): void {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
  }

  /** Config do controle. Default (sem registro): desligado + informativo. */
  async getConfig(
    user: AuthenticatedUser,
    companyId: string,
  ): Promise<BudgetConfig> {
    this.assertCompany(user, companyId);
    const cfg = await this.prisma.budgetControlConfig.findUnique({
      where: { companyId },
    });
    return {
      companyId,
      enabled: cfg?.enabled ?? false,
      policy: (cfg?.policy as 'INFORMATIVE' | 'BLOCKING') ?? 'INFORMATIVE',
    };
  }

  /** Liga/desliga o controle e escolhe a política (informativo/impeditivo). */
  async setConfig(
    user: AuthenticatedUser,
    companyId: string,
    dto: SetBudgetConfigDto,
  ): Promise<BudgetConfig> {
    this.assertCompany(user, companyId);
    const saved = await this.prisma.budgetControlConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        enabled: dto.enabled ?? false,
        policy: dto.policy ?? 'INFORMATIVE',
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.policy ? { policy: dto.policy } : {}),
      },
    });
    return {
      companyId,
      enabled: saved.enabled,
      policy: saved.policy as 'INFORMATIVE' | 'BLOCKING',
    };
  }

  /** Orçamento lançado (por filial × CC × ano/mês). */
  async listEntries(
    user: AuthenticatedUser,
    companyId: string,
    year?: number,
  ) {
    this.assertCompany(user, companyId);
    return this.prisma.budgetEntry.findMany({
      where: { companyId, ...(year ? { year } : {}) },
      orderBy: [
        { year: 'asc' },
        { month: 'asc' },
        { branchErpCode: 'asc' },
        { costCenterErpCode: 'asc' },
      ],
    });
  }

  /** Cadastro/atualização de uma linha de orçamento (idempotente pela chave). */
  async upsertEntry(
    user: AuthenticatedUser,
    companyId: string,
    dto: UpsertBudgetEntryDto,
  ) {
    this.assertCompany(user, companyId);
    if (dto.amountBudgeted < 0) {
      throw new BadRequestException('Valor do orçamento não pode ser negativo.');
    }
    return this.prisma.budgetEntry.upsert({
      where: {
        companyId_branchErpCode_costCenterErpCode_year_month: {
          companyId,
          branchErpCode: dto.branchErpCode,
          costCenterErpCode: dto.costCenterErpCode,
          year: dto.year,
          month: dto.month,
        },
      },
      create: {
        companyId,
        branchErpCode: dto.branchErpCode,
        costCenterErpCode: dto.costCenterErpCode,
        year: dto.year,
        month: dto.month,
        amountBudgeted: dto.amountBudgeted,
        importedById: user.id,
      },
      update: { amountBudgeted: dto.amountBudgeted, importedById: user.id },
    });
  }

  /**
   * Consumo orçamentário (informativo): orçado × comprometido por filial × CC ×
   * ano/mês. COMPROMETIDO = valor ativo dos itens de PC (fora DRAFT/CANCELLED),
   * alocado às células pela expansão do rateio de CC (RN-ORC-02): cada linha do
   * rateio carrega (filial, CC, %), então item.valor × %/100 entra na célula.
   * O mês é o do comprometimento (integração no ERP, com fallback na criação).
   */
  async consumption(
    user: AuthenticatedUser,
    companyId: string,
    year?: number,
  ): Promise<{
    cells: BudgetCell[];
    totals: { budgeted: number; committed: number; available: number };
  }> {
    this.assertCompany(user, companyId);
    const company = await this.prisma.company.findFirstOrThrow({
      where: { id: companyId },
      select: { code: true },
    });

    // Rateios company-wide (teamId=null = sem filtro de equipe). A célula é
    // FILIAL × CC, mas cada dimensão vem de um rateio DIFERENTE (dado real do
    // Linx): a FILIAL vem do rateio de FILIAL (branchRateioCode) e o CC do
    // rateio de CC (costCenterRateioCode) — o rateio de CC NÃO carrega filial
    // (filial_codigo nulo em 100% das linhas). Então cruzamos os dois:
    // valor × %filial × %cc. (Correção do "filial retornando null".)
    const [ccRateios, branchRateios] = await Promise.all([
      this.integration.getCostCenterRateios(company.code, true, null),
      this.integration.getBranchRateios(company.code, true, null),
    ]);
    const ccMap = new Map<string, { cc: string; pct: number }[]>();
    for (const r of ccRateios) {
      ccMap.set(
        r.codigo,
        r.linhas.map((l) => ({
          cc: l.centroCustoCodigo ?? '',
          pct: Number(l.porcentagem),
        })),
      );
    }
    const branchMap = new Map<string, { filial: string; pct: number }[]>();
    for (const r of branchRateios) {
      branchMap.set(
        r.codigo,
        r.linhas.map((l) => ({
          filial: l.filialCodigo,
          pct: Number(l.porcentagem),
        })),
      );
    }

    // Itens de PC comprometidos.
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          companyId,
          deletedAt: null,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
      },
      select: {
        totalPrice: true,
        quantity: true,
        cancelledQty: true,
        branchRateioCode: true,
        costCenterRateioCode: true,
        purchaseOrder: { select: { integratedAt: true, createdAt: true } },
      },
    });

    const key = (f: string, c: string, y: number, m: number) =>
      `${f}|${c}|${y}|${m}`;
    const committed = new Map<string, number>();
    for (const it of items) {
      const ccLines = ccMap.get(it.costCenterRateioCode);
      const branchLines = branchMap.get(it.branchRateioCode);
      // Sem um dos rateios não dá pra formar a célula filial × CC: não aloca.
      if (!ccLines?.length || !branchLines?.length) continue;
      const d = it.purchaseOrder.integratedAt ?? it.purchaseOrder.createdAt;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (year && y !== year) continue;
      const q = Number(it.quantity);
      const canceled = Number(it.cancelledQty ?? 0);
      const active =
        q > 0
          ? Number(it.totalPrice) * ((q - canceled) / q)
          : Number(it.totalPrice);
      // Cruza FILIAL × CC (percentuais independentes).
      for (const bl of branchLines) {
        for (const cl of ccLines) {
          const k = key(bl.filial, cl.cc, y, m);
          committed.set(
            k,
            (committed.get(k) ?? 0) +
              active * (bl.pct / 100) * (cl.pct / 100),
          );
        }
      }
    }

    // Orçado (BudgetEntry) + merge com o comprometido.
    const entries = await this.prisma.budgetEntry.findMany({
      where: { companyId, ...(year ? { year } : {}) },
    });
    const cells = new Map<string, BudgetCell>();
    for (const e of entries) {
      const k = key(e.branchErpCode, e.costCenterErpCode, e.year, e.month);
      cells.set(k, {
        branchErpCode: e.branchErpCode,
        costCenterErpCode: e.costCenterErpCode,
        year: e.year,
        month: e.month,
        budgeted: Number(e.amountBudgeted),
        committed: 0,
        available: Number(e.amountBudgeted),
        exceeded: false,
      });
    }
    for (const [k, v] of committed) {
      const existing = cells.get(k);
      if (existing) {
        existing.committed = v;
      } else {
        const [f, c, y, m] = k.split('|');
        cells.set(k, {
          branchErpCode: f,
          costCenterErpCode: c,
          year: Number(y),
          month: Number(m),
          budgeted: 0,
          committed: v,
          available: 0,
          exceeded: false,
        });
      }
    }
    const list = [...cells.values()]
      .map((c) => ({
        ...c,
        available: c.budgeted - c.committed,
        exceeded: c.committed > c.budgeted,
      }))
      .sort(
        (a, b) =>
          a.year - b.year ||
          a.month - b.month ||
          a.branchErpCode.localeCompare(b.branchErpCode) ||
          a.costCenterErpCode.localeCompare(b.costCenterErpCode),
      );
    const totals = list.reduce(
      (t, c) => ({
        budgeted: t.budgeted + c.budgeted,
        committed: t.committed + c.committed,
      }),
      { budgeted: 0, committed: 0 },
    );
    return {
      cells: list,
      totals: { ...totals, available: totals.budgeted - totals.committed },
    };
  }
}
