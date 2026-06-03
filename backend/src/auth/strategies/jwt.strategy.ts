import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../common/enums';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

/**
 * Valida o JWT de acesso e recarrega o usuário do banco a cada request,
 * garantindo que alterações de status/perfil tenham efeito imediato.
 *
 * Estratégias de extração (em ordem):
 *   1) Cookie httpOnly `p2p_token` — caminho preferido.
 *   2) Header `Authorization: Bearer ...` — compatibilidade com clientes legados.
 *
 * **Autenticação é independente por ambiente.** Cada env (PROD/HML) tem
 * seu próprio banco e portanto seus próprios usuários. O JWT é resolvido
 * apenas pelo `sub` (UUID), que é único naquele banco. Para trocar de
 * ambiente, o usuário desloga e escolhe o novo env na tela de login —
 * essa escolha está no front em `LoginPage`.
 */
function fromCookie(req: Request): string | null {
  return req.cookies?.p2p_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { companies: true },
    });

    // Só conta ACTIVE acessa o app. PENDING_SETUP (recém-provisionada via
    // LDAP) aguarda o admin definir perfil/empresas — antes disso não deve
    // ter sessão válida (audit M5). INACTIVE/excluída também barrada.
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        user && user.status === UserStatus.PENDING_SETUP
          ? 'Conta aguardando liberação do administrador.'
          : 'Usuário inválido ou inativo.',
      );
    }

    return {
      id: user.id,
      adUsername: user.adUsername,
      email: user.email,
      name: user.name,
      profile: user.profile,
      status: user.status,
      teamId: user.teamId,
      companyIds: user.companies.map((c) => c.companyId),
    };
  }
}
