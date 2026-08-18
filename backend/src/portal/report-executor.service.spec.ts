import { NotFoundException } from '@nestjs/common';
import { ReportExecutorService } from './report-executor.service';
import { ReportScopeService } from './report-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ExternalCategory, UserRealm } from '../common/enums';

interface Fakes {
  prisma: { $queryRawUnsafe: jest.Mock };
  scope: { scopeKeys: jest.Mock };
  calls: string[];
}

function build(opts?: { rows?: Record<string, unknown>[] }): {
  svc: ReportExecutorService;
} & Fakes {
  const calls: string[] = [];
  const rows = opts?.rows ?? [];
  const prisma = {
    $queryRawUnsafe: jest.fn((sql: string) => {
      calls.push(sql);
      if (/INFORMATION_SCHEMA/.test(sql)) {
        return Promise.resolve([
          { name: 'NOME_CLIFOR', type: 'varchar' },
          { name: 'VALOR_TOTAL', type: 'numeric' },
        ]);
      }
      return Promise.resolve(rows);
    }),
  };
  const scope = { scopeKeys: jest.fn().mockResolvedValue(['007713']) };
  const svc = new ReportExecutorService(
    prisma as unknown as PrismaService,
    scope as unknown as ReportScopeService,
  );
  return { svc, prisma, scope, calls };
}

function rep(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'u-rep',
    adUsername: null,
    email: 'rep@ex.com',
    name: 'KALIFA',
    profile: 'OPERATOR',
    status: 'ACTIVE',
    teamId: null,
    companyIds: [],
    realm: UserRealm.EXTERNAL,
    externalCategory: ExternalCategory.REPRESENTANTE,
    ...overrides,
  };
}

describe('ReportExecutorService', () => {
  it('escopa a consulta pelo código do rep (resolvido do banco) e normaliza as linhas', async () => {
    const { svc, scope, calls } = build({
      rows: [
        { NOME_CLIFOR: 'FREE SHOP MAUA   ', VALOR_TOTAL: 67188.75, QTDE: 453n },
      ],
    });
    const out = await svc.run(rep(), 'faturamentos');

    // escopo resolvido do banco p/ REP_ERP_CODE
    expect(scope.scopeKeys).toHaveBeenCalledWith('u-rep', 'REP_ERP_CODE');

    // a consulta de dados filtra pela IN-list com o código
    const dataSql = calls.find(
      (s) => /v_p2p_rep_faturamentos/.test(s) && !/INFORMATION_SCHEMA/.test(s),
    )!;
    expect(dataSql).toMatch(/IN \('007713'\)/);
    expect(dataSql).toMatch(/\[cod_representante\]/);

    // colunas vêm dos metadados; linhas normalizadas (rtrim + bigint→number)
    expect(out.columns.map((c) => c.name)).toEqual([
      'NOME_CLIFOR',
      'VALOR_TOTAL',
    ]);
    expect(out.rows[0].NOME_CLIFOR).toBe('FREE SHOP MAUA');
    expect(out.rows[0].QTDE).toBe(453);
    expect(out.rowCount).toBe(1);
    expect(out.capped).toBe(false);
  });

  it('sem escopo → devolve VAZIO e NUNCA roda a consulta de dados', async () => {
    const { svc, scope, calls } = build({ rows: [{ x: 1 }] });
    scope.scopeKeys.mockResolvedValue([]); // rep sem escopo

    const out = await svc.run(rep(), 'clientes');

    expect(out.rows).toEqual([]);
    expect(out.rowCount).toBe(0);
    // só a query de colunas rodou; nenhuma query na view de dados
    expect(
      calls.some(
        (s) => /v_p2p_rep_clientes/.test(s) && !/INFORMATION_SCHEMA/.test(s),
      ),
    ).toBe(false);
  });

  it('sanitiza o código (anti-injeção) antes de montar a IN-list', async () => {
    const { svc, scope, calls } = build({ rows: [] });
    scope.scopeKeys.mockResolvedValue(["007713'); DROP TABLE users;--"]);

    await svc.run(rep(), 'financeiro');

    const dataSql = calls.find(
      (s) => /v_p2p_rep_financeiro/.test(s) && !/INFORMATION_SCHEMA/.test(s),
    )!;
    // vira alfanumérico puro — sem aspa/;/-- que quebrariam a query
    expect(dataSql).toMatch(/IN \('007713DROPTABLEusers'\)/);
    expect(dataSql).not.toMatch(/DROP TABLE users;/);
    expect(dataSql).not.toContain("');");
  });

  it('relatório de outra categoria (ou inexistente) → 404 para este usuário', async () => {
    const { svc } = build();
    // usuário de outra categoria não enxerga o relatório do representante
    await expect(
      svc.run(rep({ externalCategory: 'FORNECEDOR' }), 'clientes'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.run(rep(), 'inexistente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lista só os relatórios da categoria do usuário', () => {
    const { svc } = build();
    const list = svc.listForUser(rep());
    expect(list.map((r) => r.key).sort()).toEqual([
      'clientes',
      'faturamentos',
      'financeiro',
    ]);
    // categoria sem relatório → lista vazia
    expect(svc.listForUser(rep({ externalCategory: 'VENDEDOR_LOJA' }))).toEqual(
      [],
    );
  });

  it('Decimal inteiro grande → string (preserva precisão); decimal → número', async () => {
    const bigId = {
      toString: () => '12345678901234567', // > 2^53
      toNumber: () => 12345678901234568, // já arredondado pelo double
    };
    const money = { toString: () => '67188.75', toNumber: () => 67188.75 };
    const { svc } = build({ rows: [{ ID: bigId, VALOR: money }] });

    const out = await svc.run(rep(), 'faturamentos');
    expect(out.rows[0].ID).toBe('12345678901234567'); // string, sem perder dígito
    expect(out.rows[0].VALOR).toBe(67188.75); // número
  });
});
