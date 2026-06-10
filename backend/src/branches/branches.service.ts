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

  /**
   * Lista filiais da empresa com o ERP + override do De-Para (alias/oculto/email).
   * `nomeExibicao` = aliasName ?? nome do ERP (é o que a UI deve mostrar).
   * Admin vê TODAS (inclusive ocultas, pra poder reexibir); telas/seletores
   * devem passar `includeHidden=false` (filtra as ocultas). [F-01/F-02]
   */
  async listForCompany(
    user: AuthenticatedUser,
    companyId: string,
    includeHidden = true,
  ) {
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
    const extByCode = new Map(extensions.map((e) => [e.branchErpCode, e]));
    return erpBranches
      .map((b) => {
        const ext = extByCode.get(b.codigo);
        const aliasName = ext?.aliasName ?? null;
        return {
          ...b,
          email: ext?.email ?? null,
          aliasName,
          hidden: ext?.hidden ?? false,
          // valor efetivo (override ?? espelho) — o que a UI exibe
          nomeExibicao: aliasName ?? b.nome,
        };
      })
      .filter((b) => includeHidden || !b.hidden);
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

  /**
   * Define o override do De-Para da filial (alias amigável e/ou ocultar),
   * sem tocar o ERP. Cria a extensão se faltar; preserva o e-mail existente.
   * [F-01 ocultar, F-02 renomear]
   */
  async setOverride(
    user: AuthenticatedUser,
    companyId: string,
    branchErpCode: string,
    data: { aliasName?: string | null; hidden?: boolean },
  ) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const aliasName = data.aliasName?.trim() || null;
    const patch: { aliasName?: string | null; hidden?: boolean } = {};
    if (data.aliasName !== undefined) patch.aliasName = aliasName;
    if (data.hidden !== undefined) patch.hidden = data.hidden;
    await this.prisma.branchExtension.upsert({
      where: { companyId_branchErpCode: { companyId, branchErpCode } },
      update: patch,
      create: {
        companyId,
        branchErpCode,
        aliasName: data.aliasName !== undefined ? aliasName : null,
        hidden: data.hidden ?? false,
      },
    });
    return { ok: true };
  }
}
