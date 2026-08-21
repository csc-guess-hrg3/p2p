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

  beforeEach(() => {
    prisma = createPrismaMock();
    getCcRateios = jest.fn();
    const integration = {
      getCostCenterRateios: getCcRateios,
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

  it('consumption: aloca o valor do item pelas linhas do rateio (RN-ORC-02)', async () => {
    prisma.company.findFirstOrThrow.mockResolvedValue({ code: 'GUESS' });
    // Rateio R1 distribui 60% p/ F1/CC-X e 40% p/ F2/CC-Y.
    getCcRateios.mockResolvedValue([
      {
        codigo: 'R1',
        descricao: 'Rateio 1',
        inativo: false,
        linhas: [
          { filialCodigo: 'F1', centroCustoCodigo: 'CC-X', porcentagem: 60 },
          { filialCodigo: 'F2', centroCustoCodigo: 'CC-Y', porcentagem: 40 },
        ],
      },
    ]);
    // 1 item de PC ativo: R$ 1.000, rateio R1, comprometido em mar/2026.
    prisma.purchaseOrderItem.findMany.mockResolvedValue([
      {
        totalPrice: 1000,
        quantity: 1,
        cancelledQty: 0,
        costCenterRateioCode: 'R1',
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

    const fx = out.cells.find(
      (c) => c.branchErpCode === 'F1' && c.costCenterErpCode === 'CC-X',
    );
    const fy = out.cells.find(
      (c) => c.branchErpCode === 'F2' && c.costCenterErpCode === 'CC-Y',
    );
    // 60% de 1000 = 600 no F1/CC-X (orçado 1000 → sobra 400, não estoura).
    expect(fx?.committed).toBe(600);
    expect(fx?.available).toBe(400);
    expect(fx?.exceeded).toBe(false);
    // 40% de 1000 = 400 no F2/CC-Y, que não tem orçamento → estoura.
    expect(fy?.committed).toBe(400);
    expect(fy?.budgeted).toBe(0);
    expect(fy?.exceeded).toBe(true);
    expect(out.totals).toEqual({ budgeted: 1000, committed: 1000, available: 0 });
  });
});
