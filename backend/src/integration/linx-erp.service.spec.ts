/**
 * Testes do LinxErpService — focam na blindagem de idempotência, que é
 * o ponto sensível da integração:
 *  - Curto-circuito quando `erpPedido` já está preenchido (não chama Linx).
 *  - Empresa sem `companyErpConfig` → BadRequest.
 *  - Re-acoplamento pelo OBS quando o INSERT no Linx já rolou mas o
 *    UPDATE local falhou no retry anterior.
 *  - prepareStagingId é idempotente: devolve o valor atual quando já existe.
 */
import { BadRequestException } from '@nestjs/common';
import type { PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { LinxErpService } from './linx-erp.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

type PoArg = PurchaseOrder & { items: PurchaseOrderItem[] };

function makePo(over: Partial<PoArg> = {}): PoArg {
  return {
    id: 'po-1',
    number: 'OC-001',
    requisitionId: 'req-1',
    companyId: 'company-test',
    branchErpCode: 'F01',
    branchName: 'Matriz',
    supplierErpCode: 'FOR-1',
    supplierName: 'Fornecedor',
    status: 'APPROVED',
    paymentCondition: '30 dias',
    deliveryAddress: null,
    expectedDelivery: new Date('2026-06-01'),
    totalAmount: '1000.00',
    notes: null,
    erpPedido: null,
    erpStagingId: null,
    items: [
      {
        id: 'poit-1',
        itemErpCode: 'IT-1',
        itemDescription: 'Item A',
        quantity: '2',
        unit: 'UN',
        unitPrice: '500.00',
        totalPrice: '1000.00',
        accountingAccount: '4.1.01.001',
        accountName: 'Material',
        branchRateioCode: 'RAT-F-01',
        branchRateioDesc: 'Matriz',
        costCenterRateioCode: 'RAT-CC-01',
        costCenterRateioDesc: 'Adm',
        receivedQty: '0',
        notes: null,
      },
    ],
    ...over,
  } as unknown as PoArg;
}

describe('LinxErpService.gravarPedidoCompra', () => {
  let prisma: PrismaMock;
  let service: LinxErpService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LinxErpService(prisma as unknown as PrismaService);
  });

  it('curto-circuita quando erpPedido já está preenchido', async () => {
    const po = makePo({ erpPedido: '00060500' });
    const out = await service.gravarPedidoCompra(po, TEST_USER);
    expect(out).toEqual({ pedido: '00060500' });
    expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('lança BadRequest quando a empresa não tem CompanyErpConfig', async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({
      id: 'company-test',
      code: 'GUESS',
      erpDbName: 'GUESS_PRODUCAO',
      erpConfig: null,
    });
    await expect(
      service.gravarPedidoCompra(makePo(), TEST_USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('re-acopla quando o PEDIDO já existe no Linx (recovery por OBS)', async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({
      id: 'company-test',
      code: 'GUESS',
      erpDbName: 'GUESS_PRODUCAO',
      erpConfig: {
        codTransacao: 'COMPRAS_003',
        tabelaFilha: 'COMPRAS_CONSUMIVEL',
        tipoCompraDefault: 'COMPRA DIVERSAS',
        ctbTipoOperacaoDefault: 202,
        naturezaEntradaDefault: '202.01',
        moeda: 'R$',
      },
    });
    prisma.requisition.findUnique.mockResolvedValue({
      tipoCompra: null,
      ctbTipoOperacao: null,
      naturezaEntrada: null,
    });
    prisma.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      erpStagingId: 'PO-po-1',
    });
    // 1ª chamada $queryRawUnsafe: lookup de FORNECEDORES (supplierErpCode setado).
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ FORNECEDOR: 'Fornecedor' }]);
    // 2ª: recovery — encontra PEDIDO existente pelo OBS.
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ PEDIDO: '00060500' }]);

    const out = await service.gravarPedidoCompra(makePo(), TEST_USER);
    expect(out).toEqual({ pedido: '00060500' });
    // Não chega a executar o INSERT (só fez o SELECT de recovery)
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('prepareStagingId devolve o existente quando já gravado', async () => {
    prisma.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      erpStagingId: 'PO-already',
    });
    const out = await service.prepareStagingId('po-1');
    expect(out).toBe('PO-already');
    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('prepareStagingId grava novo quando ausente', async () => {
    prisma.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      erpStagingId: null,
    });
    const out = await service.prepareStagingId('po-novo');
    expect(out).toBe('PO-po-novo');
    const dataMatcher: unknown = expect.objectContaining({
      erpStagingId: 'PO-po-novo',
    });
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'po-novo' },
        data: dataMatcher,
      }),
    );
  });
});
