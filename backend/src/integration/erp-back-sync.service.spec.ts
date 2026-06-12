/**
 * Testes do ErpBackSyncService — focam na regra de NÃO regressão de
 * receivedQty/cancelledQty: o back-sync (Linx → P2P) nunca pode zerar um
 * recebimento já confirmado no P2P só porque o Linx ainda não escriturou.
 */
import { ErpBackSyncService } from './erp-back-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, type PrismaMock } from '../test-utils/prisma-mock';

function openPo(receivedQty: string) {
  return {
    id: 'po-1',
    number: 'OC-1',
    erpPedido: '00060500',
    status: 'INTEGRATED',
    companyId: 'c1',
    company: { id: 'c1', code: 'GUESS', erpDbName: 'GUESS_PRODUCAO' },
    items: [
      {
        id: 'i1',
        itemErpCode: 'IT-1',
        quantity: '10',
        receivedQty,
        cancelledQty: '0',
      },
    ],
  };
}

/** Args tipados (1º argumento) das chamadas registradas de um mock. */
function firstArgs<T>(fn: { mock: { calls: unknown[][] } }): T[] {
  return fn.mock.calls.map((c) => c[0] as T);
}

interface LogCall {
  data: { status: string; errorDetails: string | null };
}
interface ItemUpdateCall {
  where: { id: string };
  data: { receivedQty: string };
}

describe('ErpBackSyncService.syncAll', () => {
  let prisma: PrismaMock;
  let service: ErpBackSyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ErpBackSyncService(prisma as unknown as PrismaService);
  });

  it('NÃO regride receivedQty quando o Linx vem menor (mantém P2P + alarma)', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([openPo('5')]);
    // Linx ainda não escriturou a entrega → qtde_entregue = 0 (< 5 local).
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        codigo: 'IT-1',
        consumivel: 'IT-1',
        qtde_entregue: 0,
        qtde_cancel_pedido: 0,
      },
    ]);

    await service.syncAll();

    // Merge mantém o maior (5) == local → nenhuma escrita pra baixo.
    expect(prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
    // Divergência alarmada no integration_log (status PARTIAL).
    const log = firstArgs<LogCall>(prisma.integrationLog.create)[0];
    expect(log.data.status).toBe('PARTIAL');
    expect(log.data.errorDetails ?? '').toContain('divergência');
  });

  it('atualiza receivedQty quando o Linx avança (sem divergência)', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([openPo('5')]);
    // Linx escriturou mais entrega → qtde_entregue = 8 (> 5 local).
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        codigo: 'IT-1',
        consumivel: 'IT-1',
        qtde_entregue: 8,
        qtde_cancel_pedido: 0,
      },
    ]);

    await service.syncAll();

    const upd = firstArgs<ItemUpdateCall>(prisma.purchaseOrderItem.update)[0];
    expect(upd.where.id).toBe('i1');
    expect(upd.data.receivedQty).toBe('8.0000');
    expect(
      firstArgs<LogCall>(prisma.integrationLog.create)[0].data.status,
    ).toBe('SUCCESS');
  });
});
