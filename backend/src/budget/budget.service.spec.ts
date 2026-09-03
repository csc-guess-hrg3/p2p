import { BudgetService } from './budget.service';
import { PrismaService } from '../prisma/prisma.service';
import type { IntegrationService } from '../integration/integration.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

describe('BudgetService — controle orçamentário', () => {
  let prisma: PrismaMock;
  let service: BudgetService;
  let getCcRateios: jest.Mock;
  let getBranchRateios: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    getCcRateios = jest.fn();
    getBranchRateios = jest.fn();
    const integration = {
      getCostCenterRateios: getCcRateios,
      getBranchRateios,
    } as unknown as IntegrationService;
    service = new BudgetService(
      prisma as unknown as PrismaService,
      integration,
    );
  });

  it('getConfig: default (sem registro) é desligado + INFORMATIVE', async () => {
    prisma.budgetControlConfig.findUnique.mockResolvedValue(null);
    const cfg = await service.getConfig(TEST_USER, 'company-test');
    expect(cfg.enabled).toBe(false);
    expect(cfg.policy).toBe('INFORMATIVE');
  });

  it('consumption: cruza rateio de FILIAL × rateio de CC (filial não vem do CC)', async () => {
    prisma.company.findFirstOrThrow.mockResolvedValue({ code: 'GUESS' });
    // Rateio de FILIAL BR1: 60% F1, 40% F2 (a filial vem DAQUI — o rateio de CC
    // não carrega filial no dado real do Linx).
    getBranchRateios.mockResolvedValue([
      {
        codigo: 'BR1',
        descricao: 'Rateio filial',
        inativo: false,
        linhas: [
          { filialCodigo: 'F1', porcentagem: 60 },
          { filialCodigo: 'F2', porcentagem: 40 },
        ],
      },
    ]);
    // Rateio de CC CC1: 70% CC-X, 30% CC-Y.
    getCcRateios.mockResolvedValue([
      {
        codigo: 'CC1',
        descricao: 'Rateio CC',
        inativo: false,
        linhas: [
          { centroCustoCodigo: 'CC-X', porcentagem: 70 },
          { centroCustoCodigo: 'CC-Y', porcentagem: 30 },
        ],
      },
    ]);
    // 1 item de PC ativo: R$ 1.000, rateios BR1 + CC1, comprometido em mar/2026.
    prisma.purchaseOrderItem.findMany.mockResolvedValue([
      {
        totalPrice: 1000,
        quantity: 1,
        cancelledQty: 0,
        branchRateioCode: 'BR1',
        costCenterRateioCode: 'CC1',
        purchaseOrder: {
          integratedAt: new Date(2026, 2, 15),
          createdAt: new Date(2026, 2, 15),
        },
      },
    ]);
    // Orçamento só p/ F1/CC-X (1.000).
    prisma.budgetEntry.findMany.mockResolvedValue([
      {
        branchErpCode: 'F1',
        costCenterErpCode: 'CC-X',
        year: 2026,
        month: 3,
        amountBudgeted: 1000,
      },
    ]);

    const out = await service.consumption(TEST_USER, 'company-test', 2026);

    const cell = (f: string, c: string) =>
      out.cells.find(
        (x) => x.branchErpCode === f && x.costCenterErpCode === c,
      );
    // Cruza filial × CC: 1000 × %filial × %cc.
    expect(cell('F1', 'CC-X')?.committed).toBeCloseTo(420); // .6 × .7
    expect(cell('F1', 'CC-Y')?.committed).toBeCloseTo(180); // .6 × .3
    expect(cell('F2', 'CC-X')?.committed).toBeCloseTo(280); // .4 × .7
    expect(cell('F2', 'CC-Y')?.committed).toBeCloseTo(120); // .4 × .3
    // F1/CC-X tem orçamento 1000 → sobra 580, não estoura.
    expect(cell('F1', 'CC-X')?.available).toBeCloseTo(580);
    expect(cell('F1', 'CC-X')?.exceeded).toBe(false);
    // F2/CC-Y não tem orçamento → estoura.
    expect(cell('F2', 'CC-Y')?.budgeted).toBe(0);
    expect(cell('F2', 'CC-Y')?.exceeded).toBe(true);
    // Total comprometido = valor do item (percentuais somam 100% em cada eixo).
    expect(out.totals.committed).toBeCloseTo(1000);
    expect(out.totals.budgeted).toBe(1000);
  });
});
