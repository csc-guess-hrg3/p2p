import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

type U = Record<string, unknown>;

function build() {
  const users: Record<string, U | undefined> = {
    admin: {
      id: 'admin', name: 'Admin', email: 'a@x', profile: 'ADMIN',
      status: 'ACTIVE', realm: 'INTERNAL', externalCategory: null,
      adUsername: 'admin', teamId: null, deletedAt: null,
      activeImpersonationSessionId: 'sess1', companies: [{ companyId: 'c1' }],
    },
    rep: {
      id: 'rep', name: 'KALIFA', email: 'r@x', profile: 'OPERATOR',
      status: 'ACTIVE', realm: 'EXTERNAL', externalCategory: 'REPRESENTANTE',
      adUsername: null, teamId: null, deletedAt: null,
      activeImpersonationSessionId: null, companies: [],
    },
    inativo: {
      id: 'inativo', name: 'X', email: 'x@x', profile: 'OPERATOR',
      status: 'INACTIVE', realm: 'INTERNAL', externalCategory: null,
      adUsername: null, teamId: null, deletedAt: null,
      activeImpersonationSessionId: null, companies: [],
    },
    exadmin: {
      id: 'exadmin', name: 'Ex', email: 'e@x', profile: 'OPERATOR',
      status: 'ACTIVE', realm: 'INTERNAL', externalCategory: null,
      adUsername: null, teamId: null, deletedAt: null,
      activeImpersonationSessionId: null, companies: [{ companyId: 'c1' }],
    },
  };
  const signed: { payload: U; opts?: U }[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users[where.id] ?? null),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: U }) => {
          const u = users[where.id];
          if (u) Object.assign(u, data);
          return Promise.resolve(u ?? {});
        },
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const jwt = {
    signAsync: jest.fn((payload: U, opts?: U) => {
      signed.push({ payload, opts });
      return Promise.resolve('tok');
    }),
    verifyAsync: jest.fn(),
  };
  const config = { getOrThrow: () => 'secret', get: () => '7d' };
  const svc = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  return { svc, prisma, jwt, signed, users };
}

/** O 1º signAsync é o access token — seu payload carrega o impersonatedBy. */
const accessPayload = (signed: { payload: U }[]) => signed[0].payload;

/** `data` da 1ª chamada de auditLog.create (tipado, sem `any`). */
function auditData(create: jest.Mock): Record<string, unknown> {
  const calls = create.mock.calls as unknown as Array<
    [{ data: Record<string, unknown> }]
  >;
  return calls[0][0].data;
}

describe('AuthService — simulação de login', () => {
  it('impersonate: emite token do alvo + impersonatedBy=admin + sessionId, registra a sessão e audita START', async () => {
    const { svc, prisma, signed } = build();
    await svc.impersonate('admin', 'rep');
    expect(accessPayload(signed).sub).toBe('rep');
    expect(accessPayload(signed).impersonatedBy).toBe('admin');
    expect(typeof accessPayload(signed).impersonationSessionId).toBe('string');
    // registrou a sessão ativa no admin
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin' } }),
    );
    expect(auditData(prisma.auditLog.create).action).toBe('IMPERSONATE_START');
  });

  it('impersonate: chamador não-admin → 403', async () => {
    const { svc } = build();
    await expect(svc.impersonate('rep', 'admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('impersonate: alvo inativo → 404', async () => {
    const { svc } = build();
    await expect(svc.impersonate('admin', 'inativo')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('impersonate: simular a si mesmo → 400', async () => {
    const { svc } = build();
    await expect(svc.impersonate('admin', 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exitImpersonation: limpa a sessão do admin, audita STOP e volta sem claim', async () => {
    const { svc, prisma, signed, users } = build();
    await svc.exitImpersonation('admin', 'rep');
    expect(accessPayload(signed).sub).toBe('admin');
    expect(accessPayload(signed).impersonatedBy ?? null).toBeNull();
    // sessão zerada => tokens de simulação antigos deixam de casar
    expect(users.admin?.activeImpersonationSessionId).toBeNull();
    expect(auditData(prisma.auditLog.create).action).toBe('IMPERSONATE_STOP');
  });

  it('refresh: preserva a simulação quando admin é ADMIN ativo E o sessionId é o atual', async () => {
    const { svc, jwt, signed } = build();
    jwt.verifyAsync.mockResolvedValue({
      sub: 'rep',
      impersonatedBy: 'admin',
      impersonationSessionId: 'sess1',
    });
    await svc.refresh('r');
    expect(accessPayload(signed).sub).toBe('rep');
    expect(accessPayload(signed).impersonatedBy).toBe('admin');
  });

  it('refresh: recusa se a sessão foi encerrada/substituída (sessionId != atual)', async () => {
    const { svc, jwt } = build();
    jwt.verifyAsync.mockResolvedValue({
      sub: 'rep',
      impersonatedBy: 'admin',
      impersonationSessionId: 'sessAntiga',
    });
    await expect(svc.refresh('r')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh: encerra se o admin da simulação não é mais ADMIN', async () => {
    const { svc, jwt } = build();
    jwt.verifyAsync.mockResolvedValue({
      sub: 'rep',
      impersonatedBy: 'exadmin',
      impersonationSessionId: 'qualquer',
    });
    await expect(svc.refresh('r')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('assertImpersonationValid: passa com admin+sessão corretos; falha em mismatch', async () => {
    const { svc } = build();
    await expect(
      svc.assertImpersonationValid('admin', 'sess1'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertImpersonationValid('admin', 'outra'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
