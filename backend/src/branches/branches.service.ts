import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Filiais para a UI admin: combina os dados do ERP (`v_p2p_branches`)
 * com as extensões P2P-side (`branch_extensions`) — hoje, só o e-mail
 * por filial usado pra recuperação de senha do vendedor e notificações.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  /** Lista filiais da empresa com o e-mail (se cadastrado). */
  async listForCompany(user: AuthenticatedUser, companyId: string) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { code: true },
    });
    const erpBranches = await this.integration.getBranches(company.code);
    const extensions = await this.prisma.branchExtension.findMany({
      where: { companyId },
    });
    const emailByCode = new Map(
      extensions.map((e) => [e.branchErpCode, e.email]),
    );
    return erpBranches.map((b) => ({
      ...b,
      email: emailByCode.get(b.codigo) ?? null,
    }));
  }

  /** Define/atualiza o e-mail de uma filial. Cria a extensão se faltar. */
  async setEmail(
    user: AuthenticatedUser,
    companyId: string,
    branchErpCode: string,
    email: string | null,
  ) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const trimmed = email?.trim().toLowerCase() ?? null;
    await this.prisma.branchExtension.upsert({
      where: {
        companyId_branchErpCode: { companyId, branchErpCode },
      },
      update: { email: trimmed },
      create: { companyId, branchErpCode, email: trimmed },
    });
    return { ok: true };
  }
}
