/**
 * Testes do ReceivingService — cobrem as regras de PRD § 9:
 *  - Validação aceito + rejeitado = recebido em cada linha.
 *  - Recebimento só em PCs com status receptivo (RN-OC-04 implícito).
 *  - Revisor não pode criar recebimento.
 *  - confirm: PARTIALLY → FULLY quando saldo zera; marca DIVERGENT
 *    quando a rejeição supera a tolerância configurada.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReceivingService } from './receiving.service';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { SettingsService } from '../settings/settings.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

function makePo(over: Partial<any> = {}) {
  return {
    id: 'po-1',
    companyId: 'company-test',
    status: 'SENT_TO_SUPPLIER',
    deletedAt: null,
    items: [
      {
        id: 'poit-1',
        itemDescription: 'Item A',
        quantity: '10',
        receivedQty: '0',
      },
    ],
    company: { code: 'GUESS' },
    ...over,
  };
}

/** Forma mínima dos args de `*.update` inspecionados nos testes. */
interface UpdateArg {
  data?: { status?: string; divergenceNotes?: string };
}

/** Acha (tipado) a 1ª chamada de update cujo `data.status` casa. */
function findUpdateByStatus(
  mock: jest.Mock,
  status: string,
): [UpdateArg] | undefined {
  const calls = mock.mock.calls as [UpdateArg][];
  return calls.find((c) => c[0]?.data?.status === status);
}

function buildService(prisma: PrismaMock) {
  const numbering = {
    next: jest.fn().mockResolvedValue('REC-001'),
  } as unknown as NumberingService;
  const settings = {
    getNumber: jest.fn().mockResolvedValue(2), // tolerância 2%
  } as unknown as SettingsService;
  const notifications = {
    create: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../notifications/notifications.service').NotificationsService;
  return new ReceivingService(
    prisma as unknown as PrismaService,
    numbering,
    settings,
    notifications,
  );
}

describe('ReceivingService.create', () => {
  let prisma: PrismaMock;
  let service: ReceivingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = buildService(prisma);
  });

  it('rejeita quando aceito + rejeitado ≠ recebido', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(makePo());
    await expect(
      service.create(TEST_USER, {
        purchaseOrderId: 'po-1',
        items: [
          {
            purchaseOrderItemId: 'poit-1',
            receivedQty: 10,
            acceptedQty: 8,
            rejectedQty: 1, // 8+1=9 ≠ 10
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia revisor de registrar recebimento', async () => {
    const reviewer = { ...TEST_USER, profile: 'REVIEWER' };
    await expect(
      service.create(reviewer, {
        purchaseOrderId: 'po-1',
        items: [
          {
            purchaseOrderItemId: 'poit-1',
            receivedQty: 10,
            acceptedQty: 10,
            rejectedQty: 0,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita PC em estado não receptivo (FULLY_RECEIVED)', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(
      makePo({ status: 'FULLY_RECEIVED' }),
    );
    await expect(
      service.create(TEST_USER, {
        purchaseOrderId: 'po-1',
        items: [
          {
            purchaseOrderItemId: 'poit-1',
            receivedQty: 10,
            acceptedQty: 10,
            rejectedQty: 0,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria recebimento DRAFT quando tudo ok', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(makePo());
    prisma.receiving.create.mockResolvedValue({
      id: 'rec-1',
      number: 'REC-001',
      items: [],
    });
    const out = await service.create(TEST_USER, {
      purchaseOrderId: 'po-1',
      items: [
        {
          purchaseOrderItemId: 'poit-1',
          receivedQty: 10,
          acceptedQty: 10,
          rejectedQty: 0,
        },
      ],
    });
    expect(out.id).toBe('rec-1');
    const dataMatcher: unknown = expect.objectContaining({ status: 'DRAFT' });
    expect(prisma.receiving.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: dataMatcher,
      }),
    );
  });
});

describe('ReceivingService.confirm', () => {
  let prisma: PrismaMock;
  let service: ReceivingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = buildService(prisma);
  });

  function setupRec(over: Partial<any> = {}) {
    const rec = {
      id: 'rec-1',
      companyId: 'company-test',
      status: 'DRAFT',
      deletedAt: null,
      purchaseOrder: { id: 'po-1' },
      items: [
        {
          purchaseOrderItemId: 'poit-1',
          receivedQty: '10',
          acceptedQty: '10',
          rejectedQty: '0',
        },
      ],
      ...over,
    };
    prisma.receiving.findUnique.mockResolvedValue(rec);
    return rec;
  }

  it('CONFIRMED quando aceito fecha o saldo (PC vira FULLY_RECEIVED)', async () => {
    setupRec();
    // Após o increment, o item tem receivedQty=10 = quantity
    prisma.purchaseOrderItem.findMany.mockResolvedValue([
      { quantity: '10', receivedQty: '10' },
    ]);
    // findOne refetch após confirm
    prisma.receiving.findUnique
      .mockResolvedValueOnce({
        id: 'rec-1',
        companyId: 'company-test',
        status: 'DRAFT',
        deletedAt: null,
        purchaseOrder: { id: 'po-1' },
        items: [
          {
            purchaseOrderItemId: 'poit-1',
            receivedQty: '10',
            acceptedQty: '10',
            rejectedQty: '0',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'rec-1',
        companyId: 'company-test',
        status: 'CONFIRMED',
        deletedAt: null,
      });

    await service.confirm(TEST_USER, 'rec-1');

    const recUpdate = findUpdateByStatus(prisma.receiving.update, 'CONFIRMED');
    expect(recUpdate).toBeTruthy();
    const poUpdate = findUpdateByStatus(
      prisma.purchaseOrder.update,
      'FULLY_RECEIVED',
    );
    expect(poUpdate).toBeTruthy();
  });

  it('DIVERGENT quando rejeição excede tolerância', async () => {
    // 50% de rejeição contra tolerância 2% → divergente
    setupRec({
      items: [
        {
          purchaseOrderItemId: 'poit-1',
          receivedQty: '10',
          acceptedQty: '5',
          rejectedQty: '5',
        },
      ],
    });
    prisma.purchaseOrderItem.findMany.mockResolvedValue([
      { quantity: '10', receivedQty: '5' },
    ]);

    await service.confirm(TEST_USER, 'rec-1');

    const recUpdate = findUpdateByStatus(prisma.receiving.update, 'DIVERGENT');
    expect(recUpdate).toBeTruthy();
    expect(recUpdate?.[0].data?.divergenceNotes).toContain('Rejeição');
  });

  it('rejeita confirmação de recebimento que não está em DRAFT', async () => {
    setupRec({ status: 'CONFIRMED' });
    await expect(service.confirm(TEST_USER, 'rec-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
