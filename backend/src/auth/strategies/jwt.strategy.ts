import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

/**
 * Valida o JWT de acesso e recarrega o usuário do banco a cada request,
 * garantindo que alterações de status/perfil tenham efeito imediato.
 *
 * O usuário é resolvido pelo `adUsername` (login de rede), que é estável
 * entre ambientes — assim o mesmo token vale em Produção e Homologação,
 * já que ambos compartilham o JWT_SECRET. O `payload.sub` é um UUID por
 * ambiente e não serve para essa resolução.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { adUsername: payload.adUsername },
      include: { companies: true },
    });

    if (!user || user.deletedAt || user.status === 'INACTIVE') {
      throw new UnauthorizedException('Usuário inválido ou inativo.');
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
