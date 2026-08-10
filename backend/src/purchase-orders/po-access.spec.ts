import { ForbiddenException } from '@nestjs/common';
import { assertPoTeamAccess } from './po-access';
import type { AuthenticatedUser } from '../auth/auth.types';

const user = {
  id: 'u1',
  profile: 'MANAGER',
  teamId: 'team-1',
  companyIds: ['comp-1'],
} as unknown as AuthenticatedUser;

const admin = { ...user, profile: 'ADMIN' };

describe('assertPoTeamAccess', () => {
  it('barra empresa fora do acesso do usuário', () => {
    expect(() =>
      assertPoTeamAccess(user, { companyId: 'comp-2', origin: 'P2P' }),
    ).toThrow(ForbiddenException);
  });

  it('P2P: barra equipe diferente para não-admin', () => {
    expect(() =>
      assertPoTeamAccess(user, {
        companyId: 'comp-1',
        origin: 'P2P',
        teamId: 'team-2',
      }),
    ).toThrow(ForbiddenException);
  });

  it('P2P: libera a própria equipe (via teamId do PO)', () => {
    expect(() =>
      assertPoTeamAccess(user, {
        companyId: 'comp-1',
        origin: 'P2P',
        teamId: 'team-1',
      }),
    ).not.toThrow();
  });

  it('P2P: libera a própria equipe (fallback pela requisição)', () => {
    expect(() =>
      assertPoTeamAccess(user, {
        companyId: 'comp-1',
        origin: 'P2P',
        teamId: null,
        requisition: { teamId: 'team-1' },
      }),
    ).not.toThrow();
  });

  it('EXTERNO: visível por empresa, sem trava de equipe (não-admin)', () => {
    expect(() =>
      assertPoTeamAccess(user, {
        companyId: 'comp-1',
        origin: 'EXTERNO',
        teamId: null,
      }),
    ).not.toThrow();
  });

  it('admin acessa P2P de qualquer equipe da empresa', () => {
    expect(() =>
      assertPoTeamAccess(admin, {
        companyId: 'comp-1',
        origin: 'P2P',
        teamId: 'team-9',
      }),
    ).not.toThrow();
  });
});
