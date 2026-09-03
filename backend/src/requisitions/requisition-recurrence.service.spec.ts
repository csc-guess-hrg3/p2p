import { RequisitionRecurrenceService } from './requisition-recurrence.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NumberingService } from '../numbering/numbering.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PurchaseOrderConverterService } from '../purchase-orders/purchase-order-converter.service';
import { createPrismaMock, type PrismaMock } from '../test-utils/prisma-mock';

function parent(over: Record<string, unknown> = {}) {
  return {
    id: 'req-parent',
    number: 'REQ-2026-000001',
    companyId: 'company-test',
    branchErpCode: '000001',
    branchName: 'MATRIZ',
    supplierErpCode: '008068',
    supplierName: 'FORNECEDOR X',
    requesterId: 'user-req',
    teamId: 'team-1',
    title: 'Aluguel',
    justification: null,
    tipoNotaFiscal: 'NF_FUTURA',
    paymentConditionCode: '002',
    paymentConditionDesc: '20 dias',
    contractRef: null,
    tipoCompra: null,
    recurrenceMonths: 3,
    totalAmount: 700,
    company: { code: 'GUESS' },
    items: [],
    ...over,
  };
}

describe('RequisitionRecurrenceService — série na aprovação', () => {
  let prisma: PrismaMock;
  let service: RequisitionRecurrenceService;
  let convert: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    convert = jest.fn().mockResolvedValue(undefined);
    const numbering = {
      next: jest.fn().mockResolvedValue('REQ-2026-000099'),
    } as unknown as NumberingService;
    const notifications = {
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const converter = { convert } as unknown as PurchaseOrderConverterService;

    // buildRequesterUser
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-req',
      name: 'Solicitante',
      adUsername: 'sol',
      username: null,
      email: 's@x',
      profile: 'OPERATOR',
      status: 'ACTIVE',
      teamId: 'team-1',
      realm: 'INTERNAL',
      externalCategory: null,
    });
    prisma.userCompany.findMany.mockResolvedValue([
      { companyId: 'company-test' },
    ]);
    // cada filha clonada
    let seq = 0;
    prisma.requisition.create.mockImplementation(async () => ({
      id: `child-${++seq}`,
      number: `REQ-C-${seq}`,
    }));

    service = new RequisitionRecurrenceService(
      prisma as unknown as PrismaService,
      numbering,
      notifications,
      converter,
    );
  });

  it('gera N filhas APROVADAS e converte cada uma com ENTREGA mensal', async () => {
    prisma.requisition.findMany.mockResolvedValue([parent()]);

    const res = await service.run();

    expect(res).toEqual({ generated: 1, pedidos: 3 });
    // 3 filhas criadas, todas APPROVED
    expect(prisma.requisition.create).toHaveBeenCalledTimes(3);
    for (const call of prisma.requisition.create.mock.calls) {
      expect(call[0].data.status).toBe('APPROVED');
      expect(call[0].data.recurrenceParentId).toBe('req-parent');
      expect(call[0].data.recurring).toBe(false);
    }
    // 3 conversões, ENTREGA escalonada ~1 mês
    expect(convert).toHaveBeenCalledTimes(3);
    const datas = convert.mock.calls.map((c) =>
      new Date(c[1].expectedDelivery as string).getMonth(),
    );
    expect(datas[1]).not.toBe(datas[0]); // mês 2 != mês 1
    expect(convert.mock.calls[0][1].requisitionId).toBe('child-1');
    // parent marcado como série gerada
    const upd = prisma.requisition.update.mock.calls.find(
      (c) => c[0].where.id === 'req-parent',
    );
    expect(upd?.[0].data.seriesGeneratedAt).toBeInstanceOf(Date);
  });

  it('convert que falha num mês não derruba os demais; série segue marcada', async () => {
    prisma.requisition.findMany.mockResolvedValue([parent({ recurrenceMonths: 3 })]);
    convert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Transportadora obrigatória'))
      .mockResolvedValueOnce(undefined);

    const res = await service.run();

    expect(convert).toHaveBeenCalledTimes(3);
    expect(res.pedidos).toBe(2); // 2 ok, 1 falhou
    const upd = prisma.requisition.update.mock.calls.find(
      (c) => c[0].where.id === 'req-parent',
    );
    expect(upd?.[0].data.seriesGeneratedAt).toBeInstanceOf(Date);
  });

  it('não gera nada quando não há recorrentes aprovadas pendentes', async () => {
    prisma.requisition.findMany.mockResolvedValue([]);
    const res = await service.run();
    expect(res).toEqual({ generated: 0, pedidos: 0 });
    expect(convert).not.toHaveBeenCalled();
  });
});
