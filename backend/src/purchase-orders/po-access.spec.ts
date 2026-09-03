import { ForbiddenException } from '@nestjs/common';
import { assertPoTeamAccess } from './po-access';
import type { AuthenticatedUser } from '../auth/auth.types';

const user = {
  id: 'u1',
  profile: 'MANAGER',
  teamId: 'team-1',
  companyIds: ['comp-1'],
} as unknown as AuthenticatedUser;

const admin = { ...user, id: 'adm', profile: 'ADMIN', email: 'a@x.com' };

// Conta PADRÃO de bootstrap (seed-admin) — email canônico.
const defaultAdmin = {
  ...user,
  id: 'root',
  profile: 'ADMIN',
  email: 'admin@p2p.local',
};

describe('assertPoTeamAccess', () => {
  it('barra empresa fora do acesso do usuário', () => {
    expect(() =>
      assertPoTeamAccess(user, { companyId: 'comp-2', buyerId: 'u1' }),
    ).toThrow(ForbiddenException);
  });

  it('libera o próprio pedido', () => {
    expect(() =>
      assertPoTeamAccess(user, { companyId: 'comp-1', buyerId: 'u1' }),
    ).not.toThrow();
  });

  it('barra o pedido de outro usuário', () => {
    expect(() =>
      assertPoTeamAccess(user, { companyId: 'comp-1', buyerId: 'u2' }),
    ).toThrow(ForbiddenException);
  });

  it('barra pedido sem dono (buyerId nulo) — ex.: externo órfão', () => {
    expect(() =>
      assertPoTeamAccess(user, { companyId: 'comp-1', buyerId: null }),
    ).toThrow(ForbiddenException);
  });

  it('admin NÃO tem bypass: só acessa os de outros pela identidade efetiva (simulação)', () => {
    // Sem modo simulação, o admin é ele mesmo — não vê o pedido de u1.
    expect(() =>
      assertPoTeamAccess(admin, { companyId: 'comp-1', buyerId: 'u1' }),
    ).toThrow(ForbiddenException);
    // O próprio pedido do admin, sim.
    expect(() =>
      assertPoTeamAccess(admin, { companyId: 'comp-1', buyerId: 'adm' }),
    ).not.toThrow();
  });

  it('libera o SOLICITANTE da requisição de origem (mesmo não sendo o comprador)', () => {
    expect(() =>
      assertPoTeamAccess(user, {
        companyId: 'comp-1',
        buyerId: 'outro-comprador',
        requisition: { requesterId: 'u1' },
      }),
    ).not.toThrow();
  });

  it('libera o REVISOR fiscal em qualquer PC (casa NF-e ↔ PC)', () => {
    const reviewer = { ...user, id: 'rev', profile: 'REVIEWER' };
    expect(() =>
      assertPoTeamAccess(reviewer, {
        companyId: 'comp-1',
        buyerId: 'outro',
        requisition: { requesterId: 'mais-outro' },
      }),
    ).not.toThrow();
  });

  it('conta PADRÃO admin acessa pedido órfão (buyerId nulo)', () => {
    expect(() =>
      assertPoTeamAccess(defaultAdmin, { companyId: 'comp-1', buyerId: null }),
    ).not.toThrow();
  });

  it('conta PADRÃO admin NÃO acessa pedido COM dono de outro (só via simulação)', () => {
    expect(() =>
      assertPoTeamAccess(defaultAdmin, { companyId: 'comp-1', buyerId: 'u1' }),
    ).toThrow(ForbiddenException);
  });

  it('admin comum (não a conta padrão) NÃO acessa órfão', () => {
    expect(() =>
      assertPoTeamAccess(admin, { companyId: 'comp-1', buyerId: null }),
    ).toThrow(ForbiddenException);
  });
});
