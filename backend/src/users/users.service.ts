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
        approvalTiers: { include: { tier: true } },
      },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  /** Atualiza perfil, status, nome, limite de aprovação e equipe. */
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
        ...(dto.approvalLimit !== undefined
          ? { approvalLimit: dto.approvalLimit }
          : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
      },
    });
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

  /** Define as alçadas em que o usuário é aprovador (substitui o conjunto). */
  async setApprovalTiers(id: string, tierIds: string[]) {
    await this.findOne(id);

    if (tierIds.length > 0) {
      const found = await this.prisma.approvalTier.count({
        where: { id: { in: tierIds } },
      });
      if (found !== tierIds.length) {
        throw new BadRequestException('Uma ou mais alçadas são inválidas.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userApprovalTier.deleteMany({ where: { userId: id } }),
      this.prisma.userApprovalTier.createMany({
        data: tierIds.map((tierId) => ({ userId: id, tierId })),
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
