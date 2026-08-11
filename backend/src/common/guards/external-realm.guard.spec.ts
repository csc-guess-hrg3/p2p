/**
 * Testes do ExternalRealmGuard — a barreira de isolamento da Área Externa.
 * Provam o default-deny (externo negado por padrão) e as três liberações:
 * @Public (ignora), @AllowExternal (compartilhada) e @ExternalOnly (portal).
 */
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExternalRealmGuard } from './external-realm.guard';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import type { ExternalAccessMeta } from '../decorators/external-access.decorator';

interface RouteMeta {
  isPublic?: boolean;
  access?: ExternalAccessMeta;
}

function makeCtx(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(meta: RouteMeta): ExternalRealmGuard {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? meta.isPublic : meta.access,
  } as unknown as Reflector;
  return new ExternalRealmGuard(reflector);
}

const INTERNAL = { realm: 'INTERNAL', externalCategory: null };
const REP = { realm: 'EXTERNAL', externalCategory: 'REPRESENTANTE' };
const VENDOR = { realm: 'EXTERNAL', externalCategory: 'VENDEDOR_LOJA' };
const ALLOW: ExternalAccessMeta = { mode: 'ALLOW' };
const ONLY_REP: ExternalAccessMeta = {
  mode: 'ONLY',
  categories: ['REPRESENTANTE'],
};
const ONLY_ANY: ExternalAccessMeta = { mode: 'ONLY' };

describe('ExternalRealmGuard', () => {
  it('rota @Public é ignorada (nem olha o realm)', () => {
    const guard = makeGuard({ isPublic: true });
    expect(guard.canActivate(makeCtx(REP))).toBe(true);
  });

  it('rota interna sem marca: INTERNO passa', () => {
    const guard = makeGuard({});
    expect(guard.canActivate(makeCtx(INTERNAL))).toBe(true);
  });

  it('default-deny: EXTERNO é negado em rota interna sem marca', () => {
    const guard = makeGuard({});
    expect(() => guard.canActivate(makeCtx(REP))).toThrow(ForbiddenException);
  });

  it('@AllowExternal: EXTERNO passa (rota compartilhada)', () => {
    const guard = makeGuard({ access: ALLOW });
    expect(guard.canActivate(makeCtx(REP))).toBe(true);
  });

  it('@AllowExternal: INTERNO continua passando', () => {
    const guard = makeGuard({ access: ALLOW });
    expect(guard.canActivate(makeCtx(INTERNAL))).toBe(true);
  });

  it('@ExternalOnly(REPRESENTANTE): categoria certa passa', () => {
    const guard = makeGuard({ access: ONLY_REP });
    expect(guard.canActivate(makeCtx(REP))).toBe(true);
  });

  it('@ExternalOnly(REPRESENTANTE): outra categoria externa é negada', () => {
    const guard = makeGuard({ access: ONLY_REP });
    expect(() => guard.canActivate(makeCtx(VENDOR))).toThrow(
      ForbiddenException,
    );
  });

  it('@ExternalOnly: INTERNO é negado (rota exclusiva do portal)', () => {
    const guard = makeGuard({ access: ONLY_ANY });
    expect(() => guard.canActivate(makeCtx(INTERNAL))).toThrow(
      ForbiddenException,
    );
  });

  it('rota não-pública sem user: defensivo, não barra (JwtAuthGuard barra antes)', () => {
    const guard = makeGuard({});
    expect(guard.canActivate(makeCtx(undefined))).toBe(true);
  });
});
