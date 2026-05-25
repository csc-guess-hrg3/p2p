import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '../common/enums';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista usuários com filtros e paginação. */
  async findAll(query: QueryUsersDto) {
    const { status, companyId, search, skip = 0, take = 50 } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(companyId ? { companies: { some: { companyId } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { adUsername: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { companies: { include: { company: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, skip, take };
  }

  /** Detalhe do usuário com empresas e alçadas. */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        companies: { include: { company: true } },
        team: { select: { id: true, name: true } },
        position: { select: { id: true, code: true, name: true } },
        branchAssignments: true,
      },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  /** Atualiza perfil, status, nome e equipe. */
  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
      });
      if (!team || team.deletedAt) {
        throw new BadRequestException('Equipe inválida.');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.profile !== undefined ? { profile: dto.profile } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.canSwitchEnv !== undefined
          ? { canSwitchEnv: dto.canSwitchEnv }
          : {}),
      },
    });
  }

  /**
   * Define as filiais que o usuário cobre (substitui o conjunto). Aceita
   * pares (companyId, branchErpCode). Usado em conjunto com User.positionId
   * pelo engine de aprovação dinâmica (Supervisor da filial X).
   */
  async setBranchAssignments(
    id: string,
    entries: Array<{ companyId: string; branchErpCode: string }>,
  ) {
    await this.findOne(id);
    // Validação leve: companyIds existem.
    const uniqueCompanies = Array.from(
      new Set(entries.map((e) => e.companyId)),
    );
    if (uniqueCompanies.length > 0) {
      const found = await this.prisma.company.count({
        where: { id: { in: uniqueCompanies }, deletedAt: null },
      });
      if (found !== uniqueCompanies.length) {
        throw new BadRequestException(
          'Uma ou mais empresas são inválidas.',
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.userBranchAssignment.deleteMany({ where: { userId: id } }),
      ...(entries.length > 0
        ? [
            this.prisma.userBranchAssignment.createMany({
              data: entries.map((e) => ({
                userId: id,
                companyId: e.companyId,
                branchErpCode: e.branchErpCode,
              })),
            }),
          ]
        : []),
    ]);
    return this.findOne(id);
  }

  /** Define a quais empresas o usuário tem acesso (substitui o conjunto). */
  async setCompanies(id: string, companyIds: string[]) {
    await this.findOne(id);

    if (companyIds.length > 0) {
      const found = await this.prisma.company.count({
        where: { id: { in: companyIds }, deletedAt: null },
      });
      if (found !== companyIds.length) {
        throw new BadRequestException('Uma ou mais empresas são inválidas.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userCompany.deleteMany({ where: { userId: id } }),
      this.prisma.userCompany.createMany({
        data: companyIds.map((companyId) => ({ userId: id, companyId })),
      }),
    ]);
    return this.findOne(id);
  }

  /** Desativação (soft delete). */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE, deletedAt: new Date() },
    });
  }
}
