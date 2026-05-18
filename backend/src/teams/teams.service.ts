import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { UserStatus } from '../common/enums';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamRateioEntryDto } from './dto/set-team-rateios.dto';
import { ApprovalLevelEntryDto } from './dto/set-approval-levels.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  async create(dto: CreateTeamDto) {
    return this.prisma.team.create({ data: { name: dto.name } });
  }

  async findAll() {
    return this.prisma.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        branchRateios: true,
        costCenterRateios: true,
        approvalLevels: {
          orderBy: { level: 'asc' },
          include: { approver: { select: { id: true, name: true } } },
        },
        manager: { select: { id: true, name: true } },
        members: { select: { id: true, name: true, adUsername: true } },
      },
    });
    if (!team || team.deletedAt) {
      throw new NotFoundException('Equipe não encontrada.');
    }
    return team;
  }

  /** Valida que o usuário existe e está ativo. */
  private async assertActiveUser(userId: string, ctx: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt || u.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(`Usuário inválido ou inativo (${ctx}).`);
    }
  }

  async update(id: string, dto: UpdateTeamDto) {
    await this.findOne(id);
    if (dto.managerId) {
      await this.assertActiveUser(dto.managerId, 'gestor');
    }
    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /** Define a cadeia de aprovação da equipe (substitui o conjunto). */
  async setApprovalLevels(id: string, levels: ApprovalLevelEntryDto[]) {
    await this.findOne(id);

    const nums = levels.map((l) => l.level);
    if (new Set(nums).size !== nums.length) {
      throw new BadRequestException('Há níveis duplicados na cadeia.');
    }
    for (const l of levels) {
      await this.assertActiveUser(l.approverId, `nível ${l.level}`);
    }

    await this.prisma.$transaction([
      this.prisma.teamApprovalLevel.deleteMany({ where: { teamId: id } }),
      this.prisma.teamApprovalLevel.createMany({
        data: levels.map((l) => ({
          teamId: id,
          level: l.level,
          name: l.name,
          approverId: l.approverId,
          maxAmount: l.maxAmount ?? null,
        })),
      }),
    ]);
    return this.findOne(id);
  }

  /** Valida cada entrada de rateio contra o ERP e devolve o código da empresa. */
  private async validateEntries(
    entries: TeamRateioEntryDto[],
    kind: 'branch' | 'costCenter',
  ): Promise<void> {
    for (const e of entries) {
      const company = await this.prisma.company.findUnique({
        where: { id: e.companyId },
      });
      if (!company || company.deletedAt) {
        throw new BadRequestException('Empresa inválida na lista de rateios.');
      }
      const found =
        kind === 'branch'
          ? await this.integration.findBranchRateio(company.code, e.code)
          : await this.integration.findCostCenterRateio(
              company.code,
              e.code,
            );
      if (!found) {
        throw new BadRequestException(
          `Rateio inválido para ${company.code}: ${e.code}`,
        );
      }
    }
  }

  /** Define os rateios de filial da equipe (substitui o conjunto). */
  async setBranchRateios(id: string, entries: TeamRateioEntryDto[]) {
    await this.findOne(id);
    await this.validateEntries(entries, 'branch');
    await this.prisma.$transaction([
      this.prisma.teamBranchRateio.deleteMany({ where: { teamId: id } }),
      this.prisma.teamBranchRateio.createMany({
        data: entries.map((e) => ({
          teamId: id,
          companyId: e.companyId,
          branchRateioCode: e.code,
        })),
      }),
    ]);
    return this.findOne(id);
  }

  /** Define os rateios de centro de custo da equipe (substitui o conjunto). */
  async setCostCenterRateios(id: string, entries: TeamRateioEntryDto[]) {
    await this.findOne(id);
    await this.validateEntries(entries, 'costCenter');
    await this.prisma.$transaction([
      this.prisma.teamCostCenterRateio.deleteMany({ where: { teamId: id } }),
      this.prisma.teamCostCenterRateio.createMany({
        data: entries.map((e) => ({
          teamId: id,
          companyId: e.companyId,
          costCenterRateioCode: e.code,
        })),
      }),
    ]);
    return this.findOne(id);
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.team.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
    });
  }
}
