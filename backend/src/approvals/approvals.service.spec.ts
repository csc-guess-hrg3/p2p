/**
 * Testes do motor de aprovação — focam nos paths críticos:
 *  - Aprovador errado → Forbidden
 *  - Solicitante tentando aprovar o próprio doc → Forbidden (RN-ALC-03)
 *  - Aprovação com próximo nível pendente → result PENDING + notifica próximo
 *  - Aprovação no último nível → result APPROVED + status final do documento
 *  - Rejeição → result REJECTED + status REJECTED no documento
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, TEST_USER, type PrismaMock } from '../test-utils/prisma-mock';

function makeStep(over: Partial<any> = {}) {
  return {
    id: 'step-1',
    companyId: 'company-test',
    entityType: 'REQUISITION',
    requisitionId: 'req-1',
    purchaseOrderId: null,
    fundRequestId: null,
    teamApprovalLevelId: 'lvl-1',
    level: 1,
    levelName: 'Gestor',
    assignedApproverId: TEST_USER.id,
    status: 'PENDING',
    decidedById: null,
    decidedAt: null,
    comments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('ApprovalsService.decide', () => {
  let prisma: PrismaMock;
  let service: ApprovalsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ApprovalsService(prisma as unknown as PrismaService);
    // Solicitante diferente do aprovador por padrão.
    prisma.requisition.findUnique.mockResolvedValue({ requesterId: 'someone-else' });
  });

  it('lança Forbidden quando o usuário não é o aprovador atribuído', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(
      makeStep({ assignedApproverId: 'outro-aprovador' }),
    );
    // sem delegações
    prisma.delegation.findMany.mockResolvedValue([]);

    await expect(service.decide(TEST_USER, 'step-1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança Forbidden quando o solicitante tenta aprovar a própria requisição (RN-ALC-03)', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.requisition.findUnique.mockResolvedValue({ requesterId: TEST_USER.id });

    await expect(service.decide(TEST_USER, 'step-1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança BadRequest quando há nível anterior pendente', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep({ level: 2 }));
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(1); // há 1 pendente em level<2

    await expect(service.decide(TEST_USER, 'step-1', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('aprovação com próximo nível pendente devolve PENDING e notifica o próximo', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(0);
    prisma.approvalStep.findFirst.mockResolvedValue(
      makeStep({ id: 'step-2', level: 2, assignedApproverId: 'admin-id' }),
    );
    prisma.requisition.findUnique
      .mockResolvedValueOnce({ requesterId: 'someone-else' }) // RN-ALC-03 check
      .mockResolvedValueOnce({ number: 'REQ-1' }); // documentNumber

    const out = await service.decide(TEST_USER, 'step-1', true);

    expect(out).toEqual({ result: 'PENDING', nextLevel: 2 });
    expect(prisma.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-1' },
        data: expect.objectContaining({ status: 'APPROVED', decidedById: TEST_USER.id }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('aprovação no último nível devolve APPROVED e marca a requisição como APPROVED', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(0);
    prisma.approvalStep.findFirst.mockResolvedValue(null); // sem próximo nível

    const out = await service.decide(TEST_USER, 'step-1', true);

    expect(out).toEqual({ result: 'APPROVED' });
    // Verifica update do documento (requisition) para APPROVED via algum updateMany/update
    const reqUpdates = prisma.requisition.update.mock.calls.map((c: any[]) => c[0]);
    const matched = reqUpdates.find(
      (u) => u?.where?.id === 'req-1' && u?.data?.status === 'APPROVED',
    );
    expect(matched).toBeTruthy();
  });

  it('rejeição devolve REJECTED e marca a requisição como REJECTED', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(0);

    const out = await service.decide(TEST_USER, 'step-1', false, 'Sem verba.');

    expect(out).toEqual({ result: 'REJECTED' });
    const reqUpdates = prisma.requisition.update.mock.calls.map((c: any[]) => c[0]);
    const matched = reqUpdates.find(
      (u) =>
        u?.where?.id === 'req-1' &&
        u?.data?.status === 'REJECTED' &&
        u?.data?.rejectionReason === 'Sem verba.',
    );
    expect(matched).toBeTruthy();
  });
});
