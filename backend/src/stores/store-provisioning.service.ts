import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalAuthService } from '../auth/local-auth.service';
import { IntegrationService } from '../integration/integration.service';
import { UserProfile, UserRealm, UserStatus } from '../common/enums';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StoreProvisionStatus =
  | 'PROVISIONED'
  | 'SKIPPED_NO_EMAIL'
  | 'ALREADY'
  | 'ERROR';

export interface StoreProvisionResult {
  branchErpCode: string;
  status: StoreProvisionStatus;
  detail?: string;
  userId?: string;
  username?: string;
}

/** Filial do ERP (v_p2p_branches) — só o que este serviço usa. */
interface ErpBranch {
  codigo: string;
  nome: string;
  inativo: boolean;
}

/**
 * Provisiona o acesso da LOJA — UM login por filial, não por vendedor. A loja é
 * um usuário INTERNO preso à filial (UserBranchAssignment): loga no app normal
 * (AD falha → cai no login local por e-mail) e usa o fluxo interno
 * (requisição/pedido/recebimento), com visibilidade escopada pela filial.
 * O e-mail vem do cadastro da filial (BranchExtension); o modo "importar" grava
 * o e-mail e provisiona no mesmo passo.
 *
 * A conta carrega um `teamId` (equipe) — é a alçada dessa equipe que aprova as
 * requisições da loja. Nasce ACTIVE; o login só funciona depois que a loja
 * define a senha pelo link. Idempotente: loja já provisionada volta como ALREADY.
 */
@Injectable()
export class StoreProvisioningService {
  private readonly logger = new Logger(StoreProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly localAuth: LocalAuthService,
  ) {}

  /** UMA loja: lê o e-mail do cadastro da filial e provisiona. */
  async provisionarUma(input: {
    empresa: string;
    branchErpCode: string;
    teamId?: string | null;
  }): Promise<StoreProvisionResult> {
    const empresa = (input.empresa ?? '').trim().toUpperCase();
    const code = (input.branchErpCode ?? '').trim();
    const companyId = await this.resolveCompanyId(empresa);
    await this.assertTeam(input.teamId);

    const branch = (await this.integration.getBranches(empresa)).find(
      (b: ErpBranch) => b.codigo === code,
    ) as ErpBranch | undefined;
    if (!branch) {
      throw new BadRequestException(
        `Filial ${code} não encontrada na empresa ${empresa}.`,
      );
    }
    if (branch.inativo) {
      throw new BadRequestException(`Filial ${code} está inativa no ERP.`);
    }

    const ext = await this.prisma.branchExtension.findUnique({
      where: {
        companyId_branchErpCode: { companyId, branchErpCode: code },
      },
      select: { email: true },
    });
    const email = ext?.email?.trim().toLowerCase() ?? null;
    return this.createFor(companyId, empresa, branch, email, input.teamId ?? null);
  }

  /** TODAS as filiais ativas com e-mail já cadastrado. */
  async provisionarTodas(input: {
    empresa: string;
    teamId?: string | null;
  }): Promise<StoreProvisionResult[]> {
    const empresa = (input.empresa ?? '').trim().toUpperCase();
    const companyId = await this.resolveCompanyId(empresa);
    await this.assertTeam(input.teamId);

    const branches = (await this.integration.getBranches(
      empresa,
    )) as ErpBranch[];
    const exts = await this.prisma.branchExtension.findMany({
      where: { companyId },
      select: { branchErpCode: true, email: true },
    });
    const emailByCode = new Map(exts.map((e) => [e.branchErpCode, e.email]));

    const results: StoreProvisionResult[] = [];
    for (const b of branches.filter((x) => !x.inativo)) {
      const email = (emailByCode.get(b.codigo) ?? '').trim().toLowerCase() || null;
      results.push(
        await this.safeCreate(companyId, empresa, b, email, input.teamId ?? null),
      );
    }
    return results;
  }

  /**
   * IMPORTAR + PROVISIONAR num passo: recebe [{branchErpCode, email}], grava o
   * e-mail na filial (BranchExtension) e provisiona. Idempotente por loja.
   */
  async importarEProvisionar(input: {
    empresa: string;
    itens: Array<{ branchErpCode: string; email: string }>;
    teamId?: string | null;
  }): Promise<StoreProvisionResult[]> {
    const empresa = (input.empresa ?? '').trim().toUpperCase();
    const companyId = await this.resolveCompanyId(empresa);
    await this.assertTeam(input.teamId);

    const byCode = new Map(
      ((await this.integration.getBranches(empresa)) as ErpBranch[]).map(
        (b) => [b.codigo, b],
      ),
    );

    const results: StoreProvisionResult[] = [];
    for (const it of input.itens ?? []) {
      const code = (it.branchErpCode ?? '').trim();
      const email = (it.email ?? '').trim().toLowerCase();
      try {
        const branch = byCode.get(code);
        if (!branch) {
          results.push({
            branchErpCode: code,
            status: 'ERROR',
            detail: 'Filial não encontrada na empresa.',
          });
          continue;
        }
        if (branch.inativo) {
          results.push({
            branchErpCode: code,
            status: 'ERROR',
            detail: 'Filial inativa no ERP.',
          });
          continue;
        }
        if (!EMAIL_RE.test(email)) {
          results.push({
            branchErpCode: code,
            status: 'ERROR',
            detail: 'E-mail inválido.',
          });
          continue;
        }
        // Grava o e-mail na filial (mesma tabela da tela de Filiais).
        await this.prisma.branchExtension.upsert({
          where: {
            companyId_branchErpCode: { companyId, branchErpCode: code },
          },
          update: { email },
          create: { companyId, branchErpCode: code, email },
        });
        results.push(
          await this.createFor(
            companyId,
            empresa,
            branch,
            email,
            input.teamId ?? null,
          ),
        );
      } catch (e) {
        results.push({
          branchErpCode: code,
          status: 'ERROR',
          detail: (e as Error).message,
        });
      }
    }
    return results;
  }

  // ---- internos ----

  private async resolveCompanyId(empresa: string): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { code: empresa, deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new BadRequestException(
        `Empresa ${empresa} não está configurada no P2P.`,
      );
    }
    return company.id;
  }

  private async assertTeam(teamId?: string | null): Promise<void> {
    if (!teamId) return;
    const team = await this.prisma.team.findFirst({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new BadRequestException('Equipe (alçada) informada não existe.');
    }
  }

  /** Igual a createFor, mas nunca lança — converte erro em resultado ERROR (uso em lote). */
  private async safeCreate(
    companyId: string,
    empresa: string,
    branch: ErpBranch,
    email: string | null,
    teamId: string | null,
  ): Promise<StoreProvisionResult> {
    try {
      return await this.createFor(companyId, empresa, branch, email, teamId);
    } catch (e) {
      return {
        branchErpCode: branch.codigo,
        status: 'ERROR',
        detail: (e as Error).message,
      };
    }
  }

  /** Cria o usuário da loja p/ uma filial já validada, com o e-mail resolvido. */
  private async createFor(
    companyId: string,
    empresa: string,
    branch: ErpBranch,
    email: string | null,
    teamId: string | null,
  ): Promise<StoreProvisionResult> {
    const code = branch.codigo;
    if (!email) {
      return {
        branchErpCode: code,
        status: 'SKIPPED_NO_EMAIL',
        detail: 'Filial sem e-mail cadastrado.',
      };
    }
    if (!EMAIL_RE.test(email)) {
      return {
        branchErpCode: code,
        status: 'ERROR',
        detail: 'E-mail da filial é inválido.',
      };
    }

    const username = `loja-${empresa.toLowerCase()}-${code.toLowerCase()}`;
    const conflict = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    if (conflict) {
      // Mesma loja (o username bate): se veio uma equipe, atualiza a alçada
      // aqui mesmo — sem precisar abrir a tela de usuário. Se o e-mail é de
      // OUTRO usuário, aí é conflito de verdade.
      if (conflict.username === username) {
        if (teamId) {
          await this.prisma.user.update({
            where: { username },
            data: { teamId },
          });
        }
        return {
          branchErpCode: code,
          status: 'ALREADY',
          detail: teamId
            ? 'Loja já existia — equipe atualizada.'
            : 'Loja já provisionada.',
        };
      }
      return {
        branchErpCode: code,
        status: 'ALREADY',
        detail: 'E-mail já está em uso por outro usuário.',
      };
    }

    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        name: branch.nome || `Loja ${code}`,
        // Loja = usuário INTERNO preso à filial: usa o app normal, com
        // visibilidade escopada pela filial. profile OPERATOR + login local
        // (e-mail); a alçada vem da equipe (teamId).
        profile: UserProfile.OPERATOR,
        realm: UserRealm.INTERNAL,
        branchScoped: true, // vê/age no escopo da filial (não own-only)
        loginType: 'LOCAL',
        status: UserStatus.ACTIVE,
        teamId: teamId ?? null,
        companies: { create: [{ companyId }] },
        // Vínculo com a filial — prende a loja à filial dela (aprovação por
        // filial e visibilidade escopada pela filial).
        branchAssignments: { create: [{ companyId, branchErpCode: code }] },
      },
      select: { id: true, username: true },
    });

    await this.localAuth.resendSetupLink(user.id, 'SETUP');
    this.logger.log(`Loja provisionada: ${empresa}/${code} → user ${user.id}.`);
    return {
      branchErpCode: code,
      status: 'PROVISIONED',
      userId: user.id,
      username: user.username ?? username,
    };
  }
}
