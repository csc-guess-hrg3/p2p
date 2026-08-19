import { NotFoundException } from '@nestjs/common';
import { ConsultaClientesService } from './consulta-clientes.service';
import { ReportScopeService } from '../report-scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ExternalCategory, UserRealm } from '../../common/enums';

interface Opts {
  codes?: string[];
  clientRow?: Record<string, unknown>;
  faturamentos?: Record<string, unknown>[];
  pedidos?: Record<string, unknown>[];
  financeiro?: Record<string, unknown>[];
  notaOk?: boolean;
}

function build(opts: Opts = {}) {
  const calls: string[] = [];
  const prisma = {
    $queryRawUnsafe: jest.fn((sql: string) => {
      calls.push(sql);
      if (/v_p2p_rep_clientes/.test(sql) && /TOP 1/.test(sql)) {
        return Promise.resolve(opts.clientRow ? [opts.clientRow] : []);
      }
      if (/v_p2p_rep_clientes/.test(sql)) return Promise.resolve([]);
      if (
        /COUNT\(\*\) n FROM \[GUESS_PRODUCAO\]\.\[dbo\]\.\[v_p2p_rep_faturamentos\]/.test(
          sql,
        )
      ) {
        return Promise.resolve([{ n: opts.notaOk ? 1 : 0 }]);
      }
      if (/v_p2p_rep_faturamentos/.test(sql))
        return Promise.resolve(opts.faturamentos ?? []);
      if (/v_p2p_nota_pedidos/.test(sql))
        return Promise.resolve(opts.pedidos ?? []);
      if (/v_p2p_rep_financeiro/.test(sql))
        return Promise.resolve(opts.financeiro ?? []);
      return Promise.resolve([]);
    }),
  };
  const scope = {
    scopeKeys: jest.fn().mockResolvedValue(opts.codes ?? ['007713']),
  };
  const svc = new ConsultaClientesService(
    prisma as unknown as PrismaService,
    scope as unknown as ReportScopeService,
  );
  return { svc, prisma, scope, calls };
}

const CLIENT = {
  NOME_CLIFOR: 'GE MEGA STORE            ',
  CLIFOR: '008103',
  RAZAO_SOCIAL: 'GE MEGA STORE',
  CGC_CPF: '93049401000117',
  EMAIL: 'adm@ge.com',
};

function rep(over?: Partial<AuthenticatedUser>): AuthenticatedUser {
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
    ...over,
  };
}

describe('ConsultaClientesService', () => {
  it('clientes: sem escopo → vazio e NÃO consulta a view', async () => {
    const { svc, prisma } = build({ codes: [] });
    const out = await svc.clientes(rep());
    expect(out.rows).toEqual([]);
    expect(out.columns.length).toBeGreaterThan(0);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('clientes: escopa a grade pelo código do rep', async () => {
    const { svc, calls } = build({ codes: ['007713'] });
    await svc.clientes(rep());
    expect(
      calls.some(
        (s) => /v_p2p_rep_clientes/.test(s) && /IN \('007713'\)/.test(s),
      ),
    ).toBe(true);
  });

  it('dados1: cliente que não é do rep → 404', async () => {
    const { svc } = build({ clientRow: undefined });
    await expect(svc.dados1(rep(), '999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('dados1: monta os grupos da ficha do cliente', async () => {
    const { svc } = build({ clientRow: CLIENT });
    const out = await svc.dados1(rep(), '008103');
    expect(out.cliente).toBe('GE MEGA STORE'); // rtrim
    const cadastro = out.groups.find((g) => g.title === 'Cliente')!;
    expect(cadastro.fields.find((f) => f.label === 'Razão Social')?.value).toBe(
      'GE MEGA STORE',
    );
  });

  it('faturamentos: filtra por código + nome do cliente e soma os totais', async () => {
    const { svc, calls } = build({
      clientRow: CLIENT,
      faturamentos: [
        {
          NF_SAIDA: '32092',
          SERIE_NF: '1',
          FILIAL: 'CD',
          QTDE_TOTAL: 42,
          VALOR_TOTAL: 7817.08,
          DESCONTO: 1550.86,
          ENCARGO: 0,
        },
      ],
    });
    const out = await svc.faturamentos(rep(), '008103');
    const dataSql = calls.find(
      (s) => /v_p2p_rep_faturamentos/.test(s) && /SELECT TOP/.test(s),
    )!;
    expect(dataSql).toMatch(/IN \('007713'\)/);
    expect(dataSql).toMatch(/LTRIM\(RTRIM\(NOME_CLIFOR\)\) = 'GE MEGA STORE'/);
    const valor = out.totais.find((t) => t.label === 'Valor Total')?.value;
    expect(valor).toBe(7817.08);
  });

  it('pedidos-nota: nota que não é do rep/cliente → vazio e NÃO consulta os pedidos', async () => {
    const { svc, calls } = build({
      clientRow: CLIENT,
      notaOk: false,
      pedidos: [{ PEDIDO: 'x' }],
    });
    const out = await svc.pedidosNota(rep(), '008103', '32092', '1', 'CD');
    expect(out.rows).toEqual([]);
    expect(calls.some((s) => /v_p2p_nota_pedidos/.test(s))).toBe(false);
  });

  it('pedidos-nota: nota válida → consulta os pedidos da nota', async () => {
    const { svc, calls } = build({
      clientRow: CLIENT,
      notaOk: true,
      pedidos: [
        {
          PEDIDO: '65229',
          entrega: new Date('2025-08-04'),
          emissao_pedido: new Date('2026-08-03'),
          pedido_cliente: '',
        },
      ],
    });
    const out = await svc.pedidosNota(rep(), '008103', '32092', '1', 'CD');
    expect(calls.some((s) => /v_p2p_nota_pedidos/.test(s))).toBe(true);
    expect(out.rows[0].PEDIDO).toBe('65229');
  });

  it('financeiro: monta a matriz de aging (vencidos × a vencer)', async () => {
    // DIAS_VENC = DATEDIFF(DD, vencimento, hoje): >0 vencido, <=0 a vencer.
    const { svc } = build({
      clientRow: CLIENT,
      financeiro: [
        { DIAS_VENC: 40, VALOR_A_RECEBER: 100 }, // vencido > 30
        { DIAS_VENC: 5, VALOR_A_RECEBER: 50 }, // vencido <= 7
        { DIAS_VENC: -20, VALOR_A_RECEBER: 200 }, // a vencer <= 30
      ],
    });
    const out = await svc.financeiro(rep(), '008103');
    expect(out.aging.vencidos.maior30).toBe(100);
    expect(out.aging.vencidos.d7).toBe(50);
    expect(out.aging.aVencer.d30).toBe(200);
    expect(out.aging.total).toBe(350);
  });
});
