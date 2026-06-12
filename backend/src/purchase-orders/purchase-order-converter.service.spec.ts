/**
 * Testes do PurchaseOrderConverterService — focam nos guards que protegem
 * o chokepoint da conversão Requisição→PC (escrita no Linx):
 *  - Guardrail de alçada: total negociado não pode estourar o aprovado.
 *  - Claim atômico APPROVED→CONVERTED: fecha o TOCTOU de conversão dupla.
 */
import { BadRequestException } from '@nestjs/common';
import { PurchaseOrderConverterService } from './purchase-order-converter.service';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { LinxErpService } from '../integration/linx-erp.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

/** Requisição aprovada, válida para conversão (1 item, total R$ 1.000). */
function makeReq(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    number: 'RC-001',
    title: 'Compra teste',
    deletedAt: null,
    companyId: 'company-test',
    status: 'APPROVED',
    tipoNotaFiscal: 'NF_EXISTENTE',
    supplierErpCode: 'FOR-1',
    supplierName: 'Fornecedor',
    branchErpCode: 'F01',
    branchName: 'Matriz',
    tipoCompra: 'COMPRA DIVERSAS',
    ctbTipoOperacao: 202,
    naturezaEntrada: '202.01',
    paymentConditionCode: '30',
    totalAmount: '1000.00',
    items: [
      {
        id: 'ri-1',
        itemErpCode: 'IT-1',
        itemDescription: 'Item A',
        accountingAccount: '4.1.01.001',
        accountName: 'Material',
        branchRateioCode: 'RAT-F-01',
        branchRateioDesc: 'Matriz',
        costCenterRateioCode: 'RAT-CC-01',
        costCenterRateioDesc: 'Adm',
        unit: 'UN',
        quantity: '2',
        estimatedPrice: '500.00',
        notes: null,
        rateios: [],
      },
    ],
    ...over,
  };
}

function makeCompany() {
  return {
    id: 'company-test',
    code: 'GUESS',
    erpConfig: { transportadoraPadrao: 'TRANSP-1' },
  };
}

describe('PurchaseOrderConverterService.convert', () => {
  let prisma: PrismaMock;
  let service: PurchaseOrderConverterService;
  const numbering = { next: jest.fn() } as unknown as NumberingService;
  const linx = {
    ensureSupplierForRequisition: jest.fn(),
    gravarPedidoCompra: jest.fn(),
  } as unknown as LinxErpService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PurchaseOrderConverterService(
      prisma as unknown as PrismaService,
      numbering,
      linx,
    );
  });

  function baseDto(overrideUnitPrice?: number) {
    return {
      requisitionId: 'req-1',
      expectedDelivery: '2026-07-01',
      transportadora: 'TRANSP-1',
      items:
        overrideUnitPrice === undefined
          ? []
          : [{ requisitionItemId: 'ri-1', unitPrice: overrideUnitPrice }],
    } as never;
  }

  it('bloqueia quando o total negociado excede o valor aprovado (guardrail de alçada)', async () => {
    prisma.requisition.findUnique.mockResolvedValue(makeReq());
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.company.findUniqueOrThrow.mockResolvedValue(makeCompany());

    // unitPrice 600 × qty 2 = 1200 > 1000 aprovado → bloqueia.
    await expect(
      service.convert(TEST_USER as never, baseDto(600)),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Nada foi reivindicado nem gravado: o guardrail roda antes do claim.
    expect(prisma.requisition.updateMany).not.toHaveBeenCalled();
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('permite quando o total negociado fica abaixo do aprovado', async () => {
    prisma.requisition.findUnique.mockResolvedValue(makeReq());
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.company.findUniqueOrThrow.mockResolvedValue(makeCompany());
    // claim falha de propósito (count 0) só pra cortar o fluxo logo após o
    // guardrail — o que importa aqui é que o guardrail NÃO barrou.
    prisma.requisition.updateMany.mockResolvedValue({ count: 0 });

    // unitPrice 400 × 2 = 800 < 1000 → passa do guardrail e chega ao claim.
    await expect(
      service.convert(TEST_USER as never, baseDto(400)),
    ).rejects.toThrow(/em conversão ou já foi convertida/);
    expect(prisma.requisition.updateMany).toHaveBeenCalledTimes(1);
  });

  it('barra conversão concorrente — claim atômico não vence (count !== 1)', async () => {
    prisma.requisition.findUnique.mockResolvedValue(makeReq());
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.company.findUniqueOrThrow.mockResolvedValue(makeCompany());
    prisma.requisition.updateMany.mockResolvedValue({ count: 0 });

    // Preço igual ao estimado (sem override) → total == aprovado, passa do
    // guardrail; o claim perde a corrida (outro convert já reivindicou).
    await expect(
      service.convert(TEST_USER as never, baseDto()),
    ).rejects.toThrow(/em conversão ou já foi convertida/);
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });
});
