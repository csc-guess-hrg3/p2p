import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Empresas às quais o usuário tem acesso. */
  async findAllForUser(user: AuthenticatedUser) {
    return this.prisma.company.findMany({
      where: { id: { in: user.companyIds }, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }
}
