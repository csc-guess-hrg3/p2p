import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfile } from '../enums';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Libera o endpoint para ADMIN OU para membro de equipe que tenha o MÓDULO
 * exigido (TeamModuleAccess) — mesmo espírito do `extraModules` do frontend.
 * Alinha o backend à liberação por módulo: ex.: a equipe Financeiro opera o
 * Contas a Pagar sem precisar ser admin. Roda depois do JwtAuthGuard.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      MODULE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true; // sem @RequireModule → nada a exigir
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
      .user;
    if (!user) return false;
    if (user.profile === UserProfile.ADMIN) return true;
    if (!user.teamId) return false;
    const has = await this.prisma.teamModuleAccess.findFirst({
      where: { teamId: user.teamId, module: required },
    });
    return !!has;
  }
}
