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
import { ApprovalEngineService } from './approval-engine.service';
import type { LinxErpService } from '../integration/linx-erp.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

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

/** Forma mínima dos args de `requisition.update` que os testes inspecionam. */
interface RequisitionUpdateArg {
  where?: { id?: string };
  data?: { status?: string; rejectionReason?: string };
}

/** Extrai (tipado) o 1º argumento de cada chamada de `requisition.update`. */
function requisitionUpdateArgs(prisma: PrismaMock): RequisitionUpdateArg[] {
  const calls = prisma.requisition.update.mock
    .calls as RequisitionUpdateArg[][];
  return calls.map((c) => c[0]);
}

describe('ApprovalsService.decide', () => {
  let prisma: PrismaMock;
  let service: ApprovalsService;
  let notifCreate: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    notifCreate = jest.fn();
    const linxStub = {
      markPedidoAprovado: jest.fn(),
    } as unknown as LinxErpService;
    const notifStub = {
      create: notifCreate,
    } as unknown as NotificationsService;
    const engine = new ApprovalEngineService(
      prisma as unknown as PrismaService,
    );
    service = new ApprovalsService(
      prisma as unknown as PrismaService,
      linxStub,
      notifStub,
      engine,
    );
    // Solicitante diferente do aprovador por padrão.
    prisma.requisition.findUnique.mockResolvedValue({
      requesterId: 'someone-else',
    });
  });

  it('lança Forbidden quando o usuário não é o aprovador atribuído', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(
      makeStep({ assignedApproverId: 'outro-aprovador' }),
    );
    // sem delegações
    prisma.delegation.findMany.mockResolvedValue([]);

    await expect(
      service.decide(TEST_USER, 'step-1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança Forbidden quando o solicitante tenta aprovar a própria requisição (RN-ALC-03)', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.requisition.findUnique.mockResolvedValue({
      requesterId: TEST_USER.id,
    });

    await expect(
      service.decide(TEST_USER, 'step-1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança BadRequest quando há nível anterior pendente', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep({ level: 2 }));
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(1); // há 1 pendente em level<2

    await expect(
      service.decide(TEST_USER, 'step-1', true),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    const dataMatcher: unknown = expect.objectContaining({
      status: 'APPROVED',
      decidedById: TEST_USER.id,
    });
    expect(prisma.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-1' },
        data: dataMatcher,
      }),
    );
    expect(notifCreate).toHaveBeenCalled();
  });

  it('aprovação no último nível devolve APPROVED e marca a requisição como APPROVED', async () => {
    prisma.approvalStep.findUnique.mockResolvedValue(makeStep());
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.approvalStep.count.mockResolvedValue(0);
    prisma.approvalStep.findFirst.mockResolvedValue(null); // sem próximo nível

    const out = await service.decide(TEST_USER, 'step-1', true);

    expect(out).toEqual({ result: 'APPROVED' });
    // Verifica update do documento (requisition) para APPROVED via algum updateMany/update
    const reqUpdates = requisitionUpdateArgs(prisma);
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
    const reqUpdates = requisitionUpdateArgs(prisma);
    const matched = reqUpdates.find(
      (u) =>
        u?.where?.id === 'req-1' &&
        u?.data?.status === 'REJECTED' &&
        u?.data?.rejectionReason === 'Sem verba.',
    );
    expect(matched).toBeTruthy();
  });

  it('lança BadRequest e não decide quando o documento já foi finalizado por outro nível (rejeição encerra o processo)', async () => {
    // Cenário do bug: gestor já reprovou (requisição REJECTED) e tenta-se
    // decidir o step do diretor. Deve travar — a requisição morre na 1ª
    // rejeição.
    prisma.approvalStep.findUnique.mockResolvedValue(
      makeStep({ id: 'step-2', level: 2, levelName: 'Diretor' }),
    );
    prisma.delegation.findMany.mockResolvedValue([]);
    prisma.requisition.findUnique.mockResolvedValue({
      status: 'REJECTED',
      requesterId: 'someone-else',
    });

    await expect(
      service.decide(TEST_USER, 'step-2', false, 'Reprovação tardia'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Não pode ter mexido na etapa nem no documento.
    expect(prisma.approvalStep.update).not.toHaveBeenCalled();
    expect(prisma.requisition.update).not.toHaveBeenCalled();
  });
});
