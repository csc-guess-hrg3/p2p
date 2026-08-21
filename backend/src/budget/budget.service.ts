import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpsertBudgetEntryDto } from './dto/upsert-budget-entry.dto';
import { SetBudgetConfigDto } from './dto/set-budget-config.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
