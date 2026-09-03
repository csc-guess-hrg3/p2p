import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, UserStatus } from '../common/enums';
import { AuthenticatedUser, JwtPayload, TokenPair } from './auth.types';

/** Extrai um atributo LDAP que pode vir como string ou array. */
function ldapAttr(
  entry: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = entry[key];
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined;
  return v != null ? String((v as string | null) ?? '') : undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Provisionamento JIT: a partir da entrada LDAP, encontra o usuário no
   * P2P (chave = login do AD / sAMAccountName) ou o cria no primeiro login
   * (status PENDING_SETUP — o admin configura perfil e empresas depois).
   */
  async provisionFromLdap(ldapUser: Record<string, unknown>): Promise<string> {
    const adUsername = (
      ldapAttr(ldapUser, 'sAMAccountName') ??
      ldapAttr(ldapUser, 'userPrincipalName')
    )?.toLowerCase();
    const email = ldapAttr(ldapUser, 'mail');
    const name =
      ldapAttr(ldapUser, 'displayName') ??
      ldapAttr(ldapUser, 'cn') ??
      adUsername;

    if (!adUsername) {
      throw new UnauthorizedException(
        'Usuário do AD sem identificador de login — contate o TI.',
      );
    }
    if (!email) {
      throw new UnauthorizedException(
        'Usuário do AD sem e-mail corporativo cadastrado — contate o TI.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { adUsername },
    });

    if (!existing) {
      const created = await this.prisma.user.create({
        data: {
          adUsername,
          email,
          name: name ?? adUsername,
          profile: UserProfile.OPERATOR,
          status: UserStatus.PENDING_SETUP,
          lastLoginAt: new Date(),
        },
      });
      this.logger.log(`Usuário provisionado via JIT: ${adUsername}`);
      return created.id;
    }

    if (existing.deletedAt || existing.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário inativo — contate o TI.');
    }

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        lastLoginAt: new Date(),
        // mantém nome/e-mail sincronizados com o AD
        name: name ?? existing.name,
        email: email ?? existing.email,
      },
    });
    return existing.id;
  }

  /**
   * Emite o par de tokens (acesso + refresh) para o usuário.
   *
   * `impersonatedBy` (simulação de login): quando presente, a identidade
   * EFETIVA do token é `userId` (o alvo), e o claim guarda o ADMIN real. O
   * mesmo claim vai no REFRESH, então a simulação sobrevive ao refresh (senão
   * o refresh voltaria a ser o alvo "de verdade", perdendo a trilha e o botão
   * de sair).
   */
  async issueTokens(
    userId: string,
    impersonatedBy: string | null = null,
    impersonationSessionId: string | null = null,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { companies: true },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado.');

    const payload: JwtPayload = {
      sub: user.id,
      adUsername: user.adUsername,
      email: user.email,
      name: user.name,
      profile: user.profile,
      status: user.status,
      teamId: user.teamId,
      companyIds: user.companies.map((c) => c.companyId),
      // realm/categoria derivam do User no banco — login E refresh emitem o
      // mesmo realm por construção (o refresh re-chama issueTokens(userId)).
      realm: user.realm,
      externalCategory: user.externalCategory,
      impersonatedBy: impersonatedBy ?? null,
      impersonationSessionId: impersonationSessionId ?? null,
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        impersonatedBy: impersonatedBy ?? null,
        impersonationSessionId: impersonationSessionId ?? null,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as SignOptions['expiresIn'],
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Devolve o usuário autenticado enriquecido com campos que NÃO vivem
   * no JWT (ex.: `canSwitchEnv` — Admin pode revogar a qualquer momento,
   * então tem que ser fresco a cada /auth/me).
   */
  async meWithExtras(user: AuthenticatedUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        canSwitchEnv: true,
        team: {
          select: { moduleAccess: { select: { module: true } } },
        },
      },
    });
    // Lista de módulos extras liberados via equipe do usuário. Admin
    // gerencia em /admin/equipes. Frontend faz UNIÃO com o que o perfil
    // já vê por padrão.
    const extraModules = row?.team?.moduleAccess.map((m) => m.module) ?? [];
    return {
      ...user,
      canSwitchEnv: row?.canSwitchEnv ?? false,
      extraModules,
    };
  }

  /** Valida o refresh token e emite um novo par. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let sub: string;
    let impersonatedBy: string | null = null;
    let impersonationSessionId: string | null = null;
    try {
      const decoded = await this.jwt.verifyAsync<{
        sub: string;
        impersonatedBy?: string | null;
        impersonationSessionId?: string | null;
      }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      sub = decoded.sub;
      impersonatedBy = decoded.impersonatedBy ?? null;
      impersonationSessionId = decoded.impersonationSessionId ?? null;
    } catch (err) {
      this.logger.debug(`Refresh inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    // Mesma regra do JwtStrategy: só ACTIVE renova sessão (audit M5).
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Usuário inválido, inativo ou pendente de liberação.',
      );
    }

    // Simulação: além do alvo (sub) ACTIVE, o admin precisa continuar ADMIN
    // ativo E a sessão ser a ATUAL (sair/re-simular invalida o token antigo —
    // senão o refresh reabriria a simulação depois do "sair").
    if (impersonatedBy) {
      await this.assertImpersonationValid(
        impersonatedBy,
        impersonationSessionId,
      );
    }
    return this.issueTokens(sub, impersonatedBy, impersonationSessionId);
  }

  /**
   * Verifica que a simulação continua válida: admin ADMIN ativo e o `sessionId`
   * é o registrado nele (não foi encerrado nem substituído). Usada pelo refresh
   * e pela JwtStrategy (revalidação a cada request enquanto simula).
   */
  async assertImpersonationValid(
    adminId: string,
    sessionId: string | null,
  ): Promise<void> {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (
      !admin ||
      admin.deletedAt ||
      admin.status !== UserStatus.ACTIVE ||
      admin.profile !== UserProfile.ADMIN ||
      !sessionId ||
      admin.activeImpersonationSessionId !== sessionId
    ) {
      throw new UnauthorizedException(
        'Simulação encerrada ou administrador não é mais válido.',
      );
    }
  }

  /**
   * Inicia a SIMULAÇÃO DE LOGIN: o admin passa a "ver como" o usuário-alvo.
   * Emite tokens com a identidade efetiva = alvo e o claim `impersonatedBy` =
   * admin. Só ADMIN ativo pode; não simula a si mesmo. Auditado.
   */
  async impersonate(adminId: string, targetId: string): Promise<TokenPair> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { companies: true },
    });
    if (
      !admin ||
      admin.deletedAt ||
      admin.status !== UserStatus.ACTIVE ||
      admin.profile !== UserProfile.ADMIN
    ) {
      throw new ForbiddenException(
        'Apenas administradores ativos podem simular login.',
      );
    }
    if (targetId === adminId) {
      throw new BadRequestException('Você já é você mesmo.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { companies: true },
    });
    if (!target || target.deletedAt || target.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Usuário para simular inválido ou inativo.');
    }

    const sessionId = randomUUID();
    // Registra a sessão ATIVA no admin — é o que torna a simulação revogável.
    await this.prisma.user.update({
      where: { id: admin.id },
      data: { activeImpersonationSessionId: sessionId },
    });
    await this.auditImpersonation('IMPERSONATE_START', admin, target);
    this.logger.log(
      `Simulação: ${admin.email} → ${target.email} (${target.id}).`,
    );
    return this.issueTokens(target.id, admin.id, sessionId);
  }

  /**
   * Encerra a simulação: volta a emitir tokens do ADMIN real (sem claim).
   * `adminId` vem do claim `impersonatedBy` da sessão simulada.
   */
  async exitImpersonation(
    adminId: string,
    targetId: string,
  ): Promise<TokenPair> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { companies: true },
    });
    if (!admin || admin.deletedAt || admin.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão de simulação inválida.');
    }
    // Encerra a sessão: qualquer token de simulação antigo deixa de casar.
    await this.prisma.user.update({
      where: { id: admin.id },
      data: { activeImpersonationSessionId: null },
    });
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { companies: true },
    });
    if (target) {
      await this.auditImpersonation('IMPERSONATE_STOP', admin, target);
    }
    return this.issueTokens(admin.id, null, null);
  }

  /** Registra início/fim de simulação na trilha de auditoria. */
  private async auditImpersonation(
    action: 'IMPERSONATE_START' | 'IMPERSONATE_STOP',
    admin: { id: string; name: string; companies: { companyId: string }[] },
    target: {
      id: string;
      name: string;
      profile: string;
      companies: { companyId: string }[];
    },
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          // companyId agora é opcional — START/STOP nunca some por falta de empresa.
          companyId:
            admin.companies[0]?.companyId ??
            target.companies[0]?.companyId ??
            null,
          userId: admin.id, // o ATOR real é o admin
          action,
          entityType: 'User',
          entityId: target.id,
          entityRef: target.id,
          after: JSON.stringify({
            simulacao: action === 'IMPERSONATE_START' ? 'início' : 'fim',
            admin: admin.name,
            alvo: target.name,
            alvoPerfil: target.profile,
          }),
        },
      });
    } catch (e) {
      this.logger.error(`Falha ao auditar simulação: ${String(e)}`);
    }
  }
}
