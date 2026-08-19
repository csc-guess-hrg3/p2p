import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalAuthService } from '../auth/local-auth.service';
import { RepresentantesErpService } from './representantes-erp.service';
import {
  ExternalCategory,
  ExternalScopeType,
  UserProfile,
  UserRealm,
  UserStatus,
} from '../common/enums';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Provisiona o acesso externo de um representante (Área Externa / F1).
 *
 * Fluxo (cadastro por admin — MVP; um formulário self-service depois só troca
 * a porta de entrada, reusa este serviço):
 *   1. Valida que o código existe e está ATIVO no Linx (v_p2p_representantes).
 *   2. Cria um User realm=EXTERNAL / categoria=REPRESENTANTE, login por
 *      username = código do representante (sem CPF), loginType=LOCAL.
 *   3. Grava o ESCOPO em ExternalScopeAssignment (REP_ERP_CODE = código) — é a
 *      chave do "só vê o que é dele" nos relatórios.
 *   4. Emite o link de definição de senha e envia por e-mail (reusa o fluxo
 *      local). O e-mail vem do cadastro porque o ERP não o guarda.
 *
 * Nasce ATIVO (sem gate de aprovação); o login só funciona depois que o
 * representante define a senha pelo link.
 */
@Injectable()
export class RepresentanteProvisioningService {
  private readonly logger = new Logger(RepresentanteProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repErp: RepresentantesErpService,
    private readonly localAuth: LocalAuthService,
  ) {}

  async provisionar(input: {
    empresa: string;
    codRepresentante: string;
    email: string;
  }): Promise<{ id: string; username: string; nome: string; email: string }> {
    const empresa = (input.empresa ?? '').trim().toUpperCase();
    const email = (input.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('E-mail inválido.');
    }

    // 1) O representante existe e está ativo no Linx?
    const rep = await this.repErp.findOne(empresa, input.codRepresentante);
    if (!rep) {
      throw new BadRequestException(
        'Representante não encontrado (ou inativo) para esta empresa. ' +
          'Confira o código na consulta de representantes.',
      );
    }
    const cod = rep.cod_representante; // já normalizado pela view

    // 2) Empresa → company do P2P.
    const company = await this.prisma.company.findFirst({
      where: { code: empresa, deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new BadRequestException(
        `Empresa ${empresa} não está configurada no P2P.`,
      );
    }

    // 3) username = código do representante. Sem colisão com usuário existente.
    const username = cod.toLowerCase();
    const conflict = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { email: true },
    });
    if (conflict) {
      throw new BadRequestException(
        conflict.email === email
          ? 'Já existe um usuário com este e-mail.'
          : 'Este representante já foi provisionado.',
      );
    }

    // 4) Cria o usuário EXTERNO + vínculo de empresa + escopo pelo código.
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        name: rep.nome || `Representante ${cod}`,
        // profile é placeholder p/ externos — realm/categoria governam o acesso
        // (o ExternalRealmGuard barra o externo de tudo que é interno).
        profile: UserProfile.OPERATOR,
        realm: UserRealm.EXTERNAL,
        externalCategory: ExternalCategory.REPRESENTANTE,
        loginType: 'LOCAL',
        status: UserStatus.ACTIVE,
        companies: { create: [{ companyId: company.id }] },
        externalScopes: {
          create: [
            {
              companyId: company.id,
              scopeType: ExternalScopeType.REP_ERP_CODE,
              scopeKey: cod,
            },
          ],
        },
      },
      select: { id: true, username: true, name: true, email: true },
    });

    // 5) Link de definição de senha + e-mail (reusa o fluxo local; sem SMTP
    //    configurado o link não é entregue e o admin reenvia — nunca logamos
    //    o token).
    await this.localAuth.resendSetupLink(user.id, 'SETUP');

    this.logger.log(
      `Representante provisionado: ${empresa}/${cod} → user ${user.id} (${username}).`,
    );
    return {
      id: user.id,
      username: user.username ?? username,
      nome: user.name,
      email: user.email,
    };
  }
}
