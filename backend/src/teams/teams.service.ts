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

/**
 * Módulos que podem ser liberados por equipe (além do que o perfil já vê).
 * O array é tratado como allowlist no setModules — qualquer outro valor
 * é rejeitado pra evitar lixo na tabela.
 */
export const KNOWN_MODULES = [
  'PA',
  'FISCAL_QUEUE',
  'REPORTS',
  'RECEIVING',
  'APPROVALS',
  'FINANCE',
] as const;
export type ModuleKey = (typeof KNOWN_MODULES)[number];

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  async create(dto: CreateTeamDto) {
    return this.prisma.team.create({
      data: { name: dto.name, companyId: dto.companyId ?? null },
    });
  }

  /**
   * Pré-preenche a EMPRESA DE ORIGEM das equipes ainda sem classificação, pela
   * regra do PO: toca HRG3 → HRG3; senão toca Guess → Guess; sem rateio → deixa
   * em branco (admin classifica na mão). Só mexe em quem está com companyId null
   * (idempotente) — não sobrescreve classificação já feita.
   */
  async inferCompanyOrigins() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true },
    });
    const hrg3 = companies.find((c) => c.code === 'HRG3')?.id ?? null;
    const guess = companies.find((c) => c.code === 'GUESS')?.id ?? null;

    const teams = await this.prisma.team.findMany({
      where: { deletedAt: null, companyId: null },
      select: {
        id: true,
        branchRateios: { select: { companyId: true } },
        costCenterRateios: { select: { companyId: true } },
      },
    });

    let classificadasHrg3 = 0;
    let classificadasGuess = 0;
    let semSinal = 0;
    for (const t of teams) {
      const touched = new Set<string>([
        ...t.branchRateios.map((r) => r.companyId),
        ...t.costCenterRateios.map((r) => r.companyId),
      ]);
      const origin =
        hrg3 && touched.has(hrg3)
          ? hrg3
          : guess && touched.has(guess)
            ? guess
            : null;
      if (!origin) {
        semSinal++;
        continue;
      }
      await this.prisma.team.update({
        where: { id: t.id },
        data: { companyId: origin },
      });
      if (origin === hrg3) classificadasHrg3++;
      else classificadasGuess++;
    }
    return {
      avaliadas: teams.length,
      classificadasHrg3,
      classificadasGuess,
      semSinal,
    };
  }

  async findAll() {
    return this.prisma.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        // Contagens exibidas na listagem: membros, níveis, rateios de filial e
        // rateios de centro de custo.
        _count: {
          select: {
            members: true,
            approvalLevels: true,
            branchRateios: true,
            costCenterRateios: true,
          },
        },
        moduleAccess: { select: { module: true } },
        company: { select: { id: true, code: true, name: true } },
      },
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
        moduleAccess: { select: { module: true } },
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
        ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
      },
    });
  }

  /**
   * Define os módulos liberados pra equipe. Substitui o conjunto inteiro;
   * `modules` vazio remove tudo. Valores fora de KNOWN_MODULES rejeitam.
   */
  async setModules(id: string, modules: string[]) {
    await this.findOne(id);
    const invalid = modules.filter(
      (m) => !KNOWN_MODULES.includes(m as ModuleKey),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Módulo(s) desconhecido(s): ${invalid.join(', ')}.`,
      );
    }
    const unique = Array.from(new Set(modules));
    await this.prisma.$transaction([
      this.prisma.teamModuleAccess.deleteMany({ where: { teamId: id } }),
      ...(unique.length > 0
        ? [
            this.prisma.teamModuleAccess.createMany({
              data: unique.map((m) => ({ teamId: id, module: m })),
            }),
          ]
        : []),
    ]);
    return this.findOne(id);
  }

  /**
   * Define a cadeia de aprovação da equipe (substitui o conjunto).
   * Cada nível tem exatamente UM aprovador: fixo (approverId) OU por cargo
   * (requiredPositionId, opcionalmente filtrado por filial).
   */
  async setApprovalLevels(id: string, levels: ApprovalLevelEntryDto[]) {
    await this.findOne(id);

    const nums = levels.map((l) => l.level);
    if (new Set(nums).size !== nums.length) {
      throw new BadRequestException('Há níveis duplicados na cadeia.');
    }
    for (const l of levels) {
      const hasFixed = !!l.approverId;
      const hasPosition = !!l.requiredPositionId;
      if (hasFixed === hasPosition) {
        throw new BadRequestException(
          `Nível ${l.level}: defina aprovador fixo OU cargo (mutuamente exclusivos).`,
        );
      }
      if (hasFixed) {
        await this.assertActiveUser(l.approverId as string, `nível ${l.level}`);
      } else {
        // Verifica que o cargo existe e está ativo.
        const pos = await this.prisma.position.findUnique({
          where: { id: l.requiredPositionId as string },
        });
        if (!pos || pos.deletedAt || !pos.active) {
          throw new BadRequestException(
            `Nível ${l.level}: cargo inválido ou inativo.`,
          );
        }
      }
      // scopeByBranch só faz sentido com cargo.
      if (l.scopeByBranch && !hasPosition) {
        throw new BadRequestException(
          `Nível ${l.level}: 'filtrar por filial' só vale com aprovador por cargo.`,
        );
      }
    }

    // Persistência por DIFF (não apaga-e-recria). Apagar todos os níveis
    // quebra quando algum já foi usado numa requisição: o ApprovalStep tem
    // FK (onDelete: NoAction) pro nível e o banco bloqueia o delete (P2003 —
    // que a UI mostrava como "referência a um registro que não existe").
    // Aqui: atualiza níveis existentes IN-PLACE (preserva o id → os steps
    // históricos continuam apontando válido), cria os novos e remove só os
    // que saíram — desvinculando antes os steps que os referenciam (o step
    // guarda snapshot de level/levelName, então não perde rastreio).
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.teamApprovalLevel.findMany({
        where: { teamId: id },
        select: { id: true, level: true },
      });
      const existingIdByLevel = new Map(existing.map((e) => [e.level, e.id]));
      const incomingLevels = new Set(levels.map((l) => l.level));

      const removedIds = existing
        .filter((e) => !incomingLevels.has(e.level))
        .map((e) => e.id);
      if (removedIds.length > 0) {
        await tx.approvalStep.updateMany({
          where: { teamApprovalLevelId: { in: removedIds } },
          data: { teamApprovalLevelId: null },
        });
        await tx.teamApprovalLevel.deleteMany({
          where: { id: { in: removedIds } },
        });
      }

      for (const l of levels) {
        const data = {
          name: l.name,
          approverId: l.approverId ?? null,
          requiredPositionId: l.requiredPositionId ?? null,
          scopeByBranch: l.scopeByBranch ?? false,
          maxAmount: l.maxAmount ?? null,
        };
        const existingId = existingIdByLevel.get(l.level);
        if (existingId) {
          await tx.teamApprovalLevel.update({
            where: { id: existingId },
            data,
          });
        } else {
          await tx.teamApprovalLevel.create({
            data: { teamId: id, level: l.level, ...data },
          });
        }
      }
    });
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
          : await this.integration.findCostCenterRateio(company.code, e.code);
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
          isPrimary: e.isPrimary ?? false,
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
