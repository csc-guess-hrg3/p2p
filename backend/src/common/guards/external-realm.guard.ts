import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import {
  EXTERNAL_ACCESS_KEY,
  ExternalAccessMeta,
} from '../decorators/external-access.decorator';
import { UserRealm } from '../enums';
import { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Isolamento de realm — a barreira DURA da Área Externa (a UI é só conforto).
 *
 * Registrado como APP_GUARD DEPOIS do JwtAuthGuard, então `req.user` já está
 * populado. Regra default-deny:
 *   - Rota @Public(): ignora (o JwtAuthGuard já liberou; não há user).
 *   - Usuário EXTERNAL: NEGADO em qualquer rota, exceto as marcadas
 *     @AllowExternal()/@ExternalOnly() — e, se a marca listar categorias, a
 *     categoria do usuário precisa bater.
 *   - Usuário INTERNAL: liberado em tudo, exceto rotas @ExternalOnly()
 *     (exclusivas do portal).
 *
 * Consequência: um controller novo nasce FECHADO para o externo sem ninguém
 * lembrar de marcá-lo — isolamento por invariante, não por checklist.
 */
@Injectable()
export class ExternalRealmGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    // Rota não-pública sem user: o JwtAuthGuard já teria barrado. Defensivo —
    // autenticar não é papel deste guard.
    if (!user) return true;

    const access = this.reflector.getAllAndOverride<
      ExternalAccessMeta | undefined
    >(EXTERNAL_ACCESS_KEY, [context.getHandler(), context.getClass()]);

    const isExternal = user.realm === UserRealm.EXTERNAL;

    if (isExternal) {
      if (!access) {
        throw new ForbiddenException(
          'Usuário da Área Externa não tem acesso a este recurso.',
        );
      }
      if (
        access.categories &&
        !access.categories.includes(user.externalCategory ?? '')
      ) {
        throw new ForbiddenException(
          'Sua categoria não tem acesso a este recurso.',
        );
      }
      return true;
    }

    // Usuário INTERNO: só é barrado nas rotas exclusivas do portal.
    if (access?.mode === 'ONLY') {
      throw new ForbiddenException('Recurso exclusivo da Área Externa.');
    }
    return true;
  }
}
