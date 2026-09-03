import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupplierValidationService } from './supplier-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { LinxErpService } from '../integration/linx-erp.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ApprovalsService } from '../approvals/approvals.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

const REVIEWER = { ...TEST_USER, profile: 'ADMIN' };

function sv(over: Record<string, unknown> = {}) {
  return {
    id: 'sv-1',
    companyId: 'company-test',
    requisitionId: 'req-1',
    status: 'PENDING',
    supplierCnpj: '12345678000199',
    requisition: {
      id: 'req-1',
      number: 'REQ-2026-000001',
      requester: { id: 'requester-1', name: 'Solicitante' },
    },
    ...over,
  };
}

describe('SupplierValidationService — gate de fornecedor novo', () => {
  let prisma: PrismaMock;
  let service: SupplierValidationService;
  let ensureSupplier: jest.Mock;
  let startChain: jest.Mock;
  let notify: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    ensureSupplier = jest.fn().mockResolvedValue('006123');
    startChain = jest.fn().mockResolvedValue(undefined);
    notify = jest.fn().mockResolvedValue(undefined);
    const linx = {
      ensureSupplierForRequisition: ensureSupplier,
    } as unknown as LinxErpService;
    const notifications = { create: notify } as unknown as NotificationsService;
    const approvals = {
      startRequisitionApprovalChain: startChain,
      resetForRequisition: jest.fn().mockResolvedValue(undefined),
    } as unknown as ApprovalsService;
    service = new SupplierValidationService(
      prisma as unknown as PrismaService,
      linx,
      notifications,
      approvals,
    );
  });

  it('openGate: cria a validação PENDING, põe a requisição em SUPPLIER_VALIDATION e avisa os revisores', async () => {
    prisma.requisition.findUniqueOrThrow.mockResolvedValue({ submittedAt: null });
    prisma.team.findMany.mockResolvedValue([{ id: 'team-fiscal' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'rev-1' }, { id: 'rev-2' }]);
    await service.openGate({
      id: 'req-1',
      companyId: 'company-test',
      number: 'REQ-2026-000001',
      supplierCnpj: '12.345.678/0001-99',
    });
    // upsert em PENDING com CNPJ só-dígitos
    const upsertArg = prisma.supplierValidation.upsert.mock.calls[0][0];
    expect(upsertArg.create.status).toBe('PENDING');
    expect(upsertArg.create.supplierCnpj).toBe('12345678000199');
    // requisição vai pra SUPPLIER_VALIDATION
    const reqUpd = prisma.requisition.update.mock.calls[0][0];
    expect(reqUpd.data.status).toBe('SUPPLIER_VALIDATION');
    // notifica os 2 revisores
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('approve: cadastra o fornecedor no Linx, marca APPROVED e retoma a cadeia', async () => {
    prisma.supplierValidation.findUnique
      .mockResolvedValueOnce(sv()) // findOne
      .mockResolvedValueOnce(sv({ status: 'APPROVED', supplierErpCode: '006123' })); // retorno final
    prisma.supplierValidation.update.mockResolvedValue(sv({ status: 'APPROVED' }));

    await service.approve(REVIEWER, 'req-1');

    expect(ensureSupplier).toHaveBeenCalledWith('req-1');
    const updArg = prisma.supplierValidation.update.mock.calls[0][0];
    expect(updArg.data.status).toBe('APPROVED');
    expect(updArg.data.supplierErpCode).toBe('006123');
    expect(startChain).toHaveBeenCalledWith('req-1');
    expect(notify).toHaveBeenCalledTimes(1); // avisa o solicitante
  });

  it('approve: bloqueia quem não é revisor', async () => {
    prisma.team.findUnique.mockResolvedValue({ id: 'team-test', isFiscal: false });
    await expect(service.approve(TEST_USER, 'req-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ensureSupplier).not.toHaveBeenCalled();
  });

  it('approve: recusa validação já resolvida', async () => {
    prisma.supplierValidation.findUnique.mockResolvedValue(
      sv({ status: 'APPROVED' }),
    );
    await expect(service.approve(REVIEWER, 'req-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ensureSupplier).not.toHaveBeenCalled();
    expect(startChain).not.toHaveBeenCalled();
  });

  it('returnToRequester: marca RETURNED, manda a requisição pra DRAFT e avisa o solicitante', async () => {
    prisma.supplierValidation.findUnique
      .mockResolvedValueOnce(sv())
      .mockResolvedValueOnce(sv({ status: 'RETURNED' }));
    prisma.supplierValidation.update.mockResolvedValue(sv({ status: 'RETURNED' }));

    await service.returnToRequester(REVIEWER, 'req-1', {
      justification: 'CNPJ divergente do informado na nota.',
    });

    const updArg = prisma.supplierValidation.update.mock.calls[0][0];
    expect(updArg.data.status).toBe('RETURNED');
    const reqUpd = prisma.requisition.update.mock.calls[0][0];
    expect(reqUpd.data.status).toBe('DRAFT');
    expect(startChain).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
