import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserProfile } from '../enums';
import { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Verifica o perfil do usuário autenticado contra os perfis exigidos
 * pelo decorator @Roles. Deve rodar depois do JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserProfile[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !required.includes(user.profile as UserProfile)) {
      throw new ForbiddenException(
        'Você não tem permissão para esta operação.',
      );
    }
    return true;
  }
}
