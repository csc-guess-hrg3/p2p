import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Garante que o usuário autenticado pertence à empresa do path param
 * `:company` (código GUESS/HRG3). Aplicado no IntegrationController inteiro.
 *
 * Sem isto, qualquer usuário logado lia os dados-mestre do ERP da OUTRA
 * empresa (fornecedores com dados bancários/PIX, itens, centros de custo,
 * filiais com CNPJ, etc.) apenas trocando o código na URL — vazamento
 * cross-tenant (auditoria P0-1). O `assertCompany` do service só validava
 * que o código era GUESS/HRG3, nunca o vínculo do usuário.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params?: Record<string, string>;
    }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Não autenticado.');

    const code = req.params?.company?.toUpperCase();
    if (!code) return true; // rota sem :company (não deve ocorrer aqui)

    const company = await this.prisma.company.findFirst({
      where: { code, deletedAt: null },
      select: { id: true },
    });
    if (!company || !user.companyIds.includes(company.id)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    return true;
  }
}
