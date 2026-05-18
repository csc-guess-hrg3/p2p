import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, UserStatus } from '../common/enums';
import { JwtPayload, TokenPair } from './auth.types';

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
    const email = ldapAttr(ldapUser, 'mail') ?? null;
    const name =
      ldapAttr(ldapUser, 'displayName') ??
      ldapAttr(ldapUser, 'cn') ??
      adUsername;

    if (!adUsername) {
      throw new UnauthorizedException(
        'Usuário do AD sem identificador de login — contate o TI.',
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

  /** Valida o refresh token e emite um novo par. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let sub: string;
    try {
      const decoded = await this.jwt.verifyAsync<{ sub: string }>(
        refreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
      sub = decoded.sub;
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.deletedAt || user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário inválido ou inativo.');
    }
    return this.issueTokens(sub);
  }
}
