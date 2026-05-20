import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Senha SMTP é mascarada na leitura — o front recebe apenas
 * `hasSmtpPassword: boolean` para indicar se há valor configurado.
 */
function redactErpConfig<T extends { smtpPassword?: string | null } | null>(
  cfg: T,
): unknown {
  if (!cfg) return null;
  const { smtpPassword, ...rest } = cfg as {
    smtpPassword?: string | null;
  } & Record<string, unknown>;
  return { ...rest, hasSmtpPassword: !!smtpPassword };
}

export interface CompanyErpConfigPatch {
  codTransacao?: string;
  tabelaFilha?: string;
  tipoCompraDefault?: string;
  ctbTipoOperacaoDefault?: number;
  naturezaEntradaDefault?: string;
  moeda?: string;
  transportadoraPadrao?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  /** undefined preserva valor atual; null limpa; string grava */
  smtpPassword?: string | null;
  smtpSecure?: boolean;
  smtpFrom?: string | null;
  smtpFromName?: string | null;
  emailSubjectTemplate?: string | null;
  emailBodyTemplate?: string | null;
}

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

  /** Configuração de integração com o ERP — leitura (senha mascarada). */
  async getErpConfig(user: AuthenticatedUser, companyId: string) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { erpConfig: true },
    });
    if (!company || company.deletedAt) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    return {
      companyId: company.id,
      companyCode: company.code,
      companyName: company.name,
      config: redactErpConfig(company.erpConfig),
    };
  }

  /**
   * Cria/atualiza a configuração de integração — restrito a ADMIN via
   * `@Roles` no controller. Mantém o que não foi mandado no patch.
   */
  async upsertErpConfig(
    user: AuthenticatedUser,
    companyId: string,
    patch: CompanyErpConfigPatch,
  ) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { erpConfig: true },
    });
    if (!company || company.deletedAt) {
      throw new NotFoundException('Empresa não encontrada.');
    }

    const current = company.erpConfig;
    const passwordPatch =
      patch.smtpPassword === undefined
        ? {}
        : { smtpPassword: patch.smtpPassword };
    const data = {
      codTransacao: patch.codTransacao ?? current?.codTransacao ?? 'COMPRAS_003',
      tabelaFilha: patch.tabelaFilha ?? current?.tabelaFilha ?? 'COMPRAS_CONSUMIVEL',
      tipoCompraDefault:
        patch.tipoCompraDefault ?? current?.tipoCompraDefault ?? 'COMPRA DIVERSAS',
      ctbTipoOperacaoDefault:
        patch.ctbTipoOperacaoDefault ?? current?.ctbTipoOperacaoDefault ?? 202,
      naturezaEntradaDefault:
        patch.naturezaEntradaDefault ?? current?.naturezaEntradaDefault ?? '202.01',
      moeda: patch.moeda ?? current?.moeda ?? 'R$',
      transportadoraPadrao:
        patch.transportadoraPadrao ?? current?.transportadoraPadrao ?? null,
      smtpHost: patch.smtpHost ?? current?.smtpHost ?? null,
      smtpPort: patch.smtpPort ?? current?.smtpPort ?? null,
      smtpUser: patch.smtpUser ?? current?.smtpUser ?? null,
      smtpSecure: patch.smtpSecure ?? current?.smtpSecure ?? false,
      smtpFrom: patch.smtpFrom ?? current?.smtpFrom ?? null,
      smtpFromName: patch.smtpFromName ?? current?.smtpFromName ?? null,
      emailSubjectTemplate:
        patch.emailSubjectTemplate ?? current?.emailSubjectTemplate ?? null,
      emailBodyTemplate:
        patch.emailBodyTemplate ?? current?.emailBodyTemplate ?? null,
    };

    const saved = await this.prisma.companyErpConfig.upsert({
      where: { companyId },
      create: { companyId, ...data, ...passwordPatch },
      update: { ...data, ...passwordPatch },
    });
    return redactErpConfig(saved);
  }
}
