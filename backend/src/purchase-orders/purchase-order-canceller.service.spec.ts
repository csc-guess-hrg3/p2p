/**
 * Testes do PurchaseOrderCancellerService — focam na propagação do
 * cancelamento ao Linx (H-2) e no comportamento best-effort (uma falha no
 * ERP não derruba o cancelamento no P2P, mas registra integration_log).
 */
import { PurchaseOrderCancellerService } from './purchase-order-canceller.service';
import { PrismaService } from '../prisma/prisma.service';
import { LinxErpService } from '../integration/linx-erp.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

/** Argumento `argIdx` da chamada `callIdx` de um mock, tipado. */
function callArg<T>(fn: jest.Mock, callIdx: number, argIdx: number): T {
  return (fn.mock.calls as unknown[][])[callIdx][argIdx] as T;
}

function makePo(over: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    number: 'OC-1',
    status: 'INTEGRATED',
    companyId: 'company-test',
    erpPedido: '00060500',
    deletedAt: null,
    requisition: { teamId: 'team-test' },
    buyer: { id: 'u1', name: 'Comprador' },
    receivings: [],
    items: [
      {
        id: 'i1',
        itemErpCode: 'IT-1',
        itemDescription: 'Item A',
        quantity: '2',
        receivedQty: '0',
        cancelledQty: '0',
        unitPrice: '50',
        cancelledAt: null,
        rateios: [],
      },
    ],
    ...over,
  };
}

describe('PurchaseOrderCancellerService.cancel (H-2 back-write Linx)', () => {
  let prisma: PrismaMock;
  let service: PurchaseOrderCancellerService;
  let linx: { markPedidoCancelado: jest.Mock; cancelarSaldoItens: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    linx = {
      markPedidoCancelado: jest.fn().mockResolvedValue(undefined),
      cancelarSaldoItens: jest.fn().mockResolvedValue(undefined),
    };
    service = new PurchaseOrderCancellerService(
      prisma as unknown as PrismaService,
      linx as unknown as LinxErpService,
    );
  });

  it('cancela no P2P e propaga ao Linx (header cancelado + zera saldo das linhas)', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(makePo());

    await service.cancel(TEST_USER, 'po-1', 'motivo do cancelamento');

    // Header marcado como cancelado no Linx.
    expect(linx.markPedidoCancelado).toHaveBeenCalledTimes(1);
    // Saldo das linhas cancelado (2 un × R$ 50 = R$ 100).
    expect(linx.cancelarSaldoItens).toHaveBeenCalledTimes(1);
    const lines = callArg<
      Array<{ consumivel: string; qtdeCancel: number; valorCancel: number }>
    >(linx.cancelarSaldoItens, 0, 1);
    expect(lines).toEqual([
      { consumivel: 'IT-1', qtdeCancel: 2, valorCancel: 100 },
    ]);
    // Não registrou falha de integração (deu certo).
    expect(prisma.integrationLog.create).not.toHaveBeenCalled();
  });

  it('best-effort: falha no Linx NÃO derruba o cancelamento e registra integration_log', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(makePo());
    prisma.company.findUnique.mockResolvedValue({ code: 'GUESS' });
    linx.markPedidoCancelado.mockRejectedValue(new Error('Linx fora do ar'));

    // Não lança — o cancelamento no P2P já está feito.
    await expect(
      service.cancel(TEST_USER as never, 'po-1', 'motivo do cancelamento'),
    ).resolves.toBeDefined();

    // Registrou a divergência pra reconciliação manual.
    expect(prisma.integrationLog.create).toHaveBeenCalledTimes(1);
    const data = callArg<{ data: { jobType: string; status: string } }>(
      prisma.integrationLog.create,
      0,
      0,
    );
    expect(data.data.jobType).toBe('CANCEL_PO');
    expect(data.data.status).toBe('FAILED');
  });
});
