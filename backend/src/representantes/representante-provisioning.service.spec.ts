/**
 * Testes do provisionamento de representante (Área Externa / F1): cria o
 * usuário EXTERNO com escopo pelo código e só provisiona quem existe/ativo
 * no Linx.
 */
import { BadRequestException } from '@nestjs/common';
import { RepresentanteProvisioningService } from './representante-provisioning.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { LocalAuthService } from '../auth/local-auth.service';
import type { RepresentantesErpService } from './representantes-erp.service';

interface Fakes {
  prisma: {
    company: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock };
  };
  repErp: { findOne: jest.Mock };
  localAuth: { resendSetupLink: jest.Mock };
}

function build(): { svc: RepresentanteProvisioningService } & Fakes {
  const prisma = {
    company: {
      findFirst: jest.fn().mockResolvedValue({ id: 'company-guess' }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'u-rep',
        username: '001040',
        name: 'LUCAS BOVI',
        email: 'rep@ex.com',
      }),
    },
  };
  const repErp = {
    findOne: jest.fn().mockResolvedValue({
      empresa: 'GUESS',
      cod_representante: '001040',
      nome: 'LUCAS BOVI',
      documento: '123',
    }),
  };
  const localAuth = {
    resendSetupLink: jest.fn().mockResolvedValue({ ok: true }),
  };
  const svc = new RepresentanteProvisioningService(
    prisma as unknown as PrismaService,
    repErp as unknown as RepresentantesErpService,
    localAuth as unknown as LocalAuthService,
  );
  return { svc, prisma, repErp, localAuth };
}

describe('RepresentanteProvisioningService', () => {
  it('cria usuário EXTERNO + escopo por código e dispara o link de senha', async () => {
    const { svc, prisma, localAuth } = build();
    const out = await svc.provisionar({
      empresa: 'guess',
      codRepresentante: '001040',
      email: 'Rep@Ex.com',
    });
    expect(out.id).toBe('u-rep');

    const calls = prisma.user.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    const data = calls[0][0].data;
    expect(data.realm).toBe('EXTERNAL');
    expect(data.externalCategory).toBe('REPRESENTANTE');
    expect(data.username).toBe('001040');
    expect(data.email).toBe('rep@ex.com'); // normalizado p/ minúsculo
    const scopes = (
      data.externalScopes as {
        create: Array<{ scopeType: string; scopeKey: string }>;
      }
    ).create;
    expect(scopes[0]).toMatchObject({
      scopeType: 'REP_ERP_CODE',
      scopeKey: '001040',
    });
    expect(localAuth.resendSetupLink).toHaveBeenCalledWith('u-rep', 'SETUP');
  });

  it('rejeita código inexistente/inativo no Linx (não cria usuário)', async () => {
    const { svc, repErp, prisma } = build();
    repErp.findOne.mockResolvedValue(null);
    await expect(
      svc.provisionar({
        empresa: 'GUESS',
        codRepresentante: '999999',
        email: 'x@ex.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejeita e-mail inválido antes de tocar o banco/ERP', async () => {
    const { svc, repErp } = build();
    await expect(
      svc.provisionar({
        empresa: 'GUESS',
        codRepresentante: '001040',
        email: 'invalido',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repErp.findOne).not.toHaveBeenCalled();
  });
});
