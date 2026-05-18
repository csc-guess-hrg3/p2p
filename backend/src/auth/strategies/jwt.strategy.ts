import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

/**
 * Valida o JWT de acesso e recarrega o usuário do banco a cada request,
 * garantindo que alterações de status/perfil tenham efeito imediato.
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
      where: { id: payload.sub },
      include: { companies: true },
    });

    if (!user || user.deletedAt || user.status === 'INACTIVE') {
      throw new UnauthorizedException('Usuário inválido ou inativo.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      profile: user.profile,
      status: user.status,
      companyIds: user.companies.map((c) => c.companyId),
    };
  }
}
