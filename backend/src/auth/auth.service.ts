import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, UserStatus } from '../common/enums';
import { AuthenticatedUser, JwtPayload, TokenPair } from './auth.types';
import { DEMO_USERS, findDemoUser, isDemoModeEnabled } from './demo-users';

/** Extrai um atributo LDAP que pode vir como string ou array. */
function ldapAttr(
  entry: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = entry[key];
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined;
  return v != null ? String(v) : undefined;
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

  /** Emite o par de tokens (acesso + refresh) para o usuário. */
  async issueTokens(userId: string): Promise<TokenPair> {
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
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as SignOptions['expiresIn'],
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Login do Modo Demonstração — bypassa o LDAP.
   *
   * Pré-requisitos:
   *  - `DEMO_MODE_ENABLED=true` no env (jamais ligar em produção real);
   *  - usuário existente no banco (seed-demo.js cria os 4 perfis).
   *
   * Não verificamos senha server-side: o `password` declarado em `demo-users.ts`
   * é só uma referência para o frontend exibir/preencher. A trava real é a flag
   * de ambiente.
   */
  async loginDemo(username: string): Promise<string> {
    if (!isDemoModeEnabled()) {
      throw new ForbiddenException(
        'Modo demonstração desativado. Configure DEMO_MODE_ENABLED=true para usar.',
      );
    }
    const demo = findDemoUser(username);
    if (!demo) {
      throw new UnauthorizedException(
        `Usuário demo "${username}" não cadastrado. Use um dos perfis disponíveis ` +
          `em /api/auth/demo-users.`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { adUsername: demo.username },
    });
    if (!user) {
      throw new NotFoundException(
        `Usuário demo "${demo.username}" não existe no banco. Rode o seed: ` +
          `node seed-demo.js (cria empresa DEMO, equipe e os 4 perfis).`,
      );
    }
    if (user.deletedAt || user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário demo inativo.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    this.logger.log(`Login demo: ${demo.username} (${demo.profile})`);
    return user.id;
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
    const extraModules =
      row?.team?.moduleAccess.map((m) => m.module) ?? [];
    return {
      ...user,
      canSwitchEnv: row?.canSwitchEnv ?? false,
      extraModules,
    };
  }

  /** Lista os usuários demo disponíveis (para o seletor do frontend). */
  listDemoUsers() {
    if (!isDemoModeEnabled()) {
      return { enabled: false, users: [] as typeof DEMO_USERS };
    }
    return {
      enabled: true,
      users: DEMO_USERS.map((u) => ({
        username: u.username,
        name: u.name,
        profile: u.profile,
        description: u.description,
      })),
    };
  }

  /** Valida o refresh token e emite um novo par. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let sub: string;
    try {
      const decoded = await this.jwt.verifyAsync<{ sub: string }>(
        refreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
      sub = decoded.sub;
    } catch (err) {
      this.logger.debug(`Refresh inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.deletedAt || user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário inválido ou inativo.');
    }
    return this.issueTokens(sub);
  }
}
