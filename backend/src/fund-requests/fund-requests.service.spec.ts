import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FundRequestsService } from './fund-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import type { LinxErpService } from '../integration/linx-erp.service';
import type { NumberingService } from '../numbering/numbering.service';
import type { ApprovalsService } from '../approvals/approvals.service';
import {
  createPrismaMock,
  TEST_USER,
  type PrismaMock,
} from '../test-utils/prisma-mock';

function item(over: Record<string, unknown> = {}) {
  return {
    description: 'Taxa municipal',
    beneficiaryName: 'Prefeitura',
    accountingAccount: '4.1.01.001',
    branchRateioCode: 'F01',
    costCenterRateioCode: 'CC01',
    amount: 100,
    dueDate: '2026-09-01',
    ...over,
  };
}

/** 1º argumento (tipado) de uma chamada de mock, sem `any`. */
function firstArg<T>(m: jest.Mock): T {
  return (m.mock.calls as unknown as T[][])[0][0];
}

describe('FundRequestsService — SV avulsa', () => {
  let prisma: PrismaMock;
  let service: FundRequestsService;
  let assertChain: jest.Mock;
  let startApproval: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    assertChain = jest.fn().mockResolvedValue(undefined);
    startApproval = jest.fn().mockResolvedValue(1);
    const approvals = {
      assertChainConfigured: assertChain,
      resetForFundRequest: jest.fn().mockResolvedValue(undefined),
      startApproval,
      // Por padrão o usuário do teste NÃO é aprovador — isola o teste de dono.
      isApproverForEntity: jest.fn().mockResolvedValue(false),
    } as unknown as ApprovalsService;
    const numbering = {
      next: jest.fn().mockResolvedValue('SV-2026-000001'),
    } as unknown as NumberingService;
    const linx = {} as unknown as LinxErpService;
    service = new FundRequestsService(
      prisma as unknown as PrismaService,
      linx,
      numbering,
      approvals,
    );
  });

  it('create: gera número SV e cria em DRAFT somando o total dos itens', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'company-test',
      code: 'GUESS',
    });
    prisma.fundRequest.create.mockResolvedValue({ id: 'sv-1' });
    await service.create(TEST_USER, {
      companyId: 'company-test',
      title: 'Pagamento avulso',
      items: [item(), item({ amount: 50 })],
    });
    const arg = firstArg<{ data: Record<string, unknown> }>(
      prisma.fundRequest.create,
    );
    expect(arg.data.status).toBe('DRAFT');
    expect(arg.data.number).toBe('SV-2026-000001');
    expect(arg.data.totalAmount).toBe(150);
  });

  it('create: sem acesso à empresa → 403', async () => {
    await expect(
      service.create(
        { ...TEST_USER, companyIds: ['outra-empresa'] },
        { companyId: 'company-test', title: 't', items: [item()] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submit: BLOQUEIA se a equipe do solicitante não tem alçada (fail-safe, nunca auto-aprova pagamento)', async () => {
    prisma.fundRequest.findUnique.mockResolvedValue({
      id: 'sv-1',
      companyId: 'company-test',
      requesterId: TEST_USER.id,
      status: 'DRAFT',
      totalAmount: 100,
      items: [item()],
      deletedAt: null,
    });
    assertChain.mockRejectedValue(new BadRequestException('sem alçada'));
    await expect(service.submit(TEST_USER, 'sv-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(startApproval).not.toHaveBeenCalled();
  });

  it('submit: com alçada → IN_APPROVAL usando a equipe do solicitante', async () => {
    prisma.fundRequest.findUnique
      .mockResolvedValueOnce({
        id: 'sv-1',
        companyId: 'company-test',
        requesterId: TEST_USER.id,
        status: 'DRAFT',
        totalAmount: 100,
        items: [item()],
        deletedAt: null,
      })
      .mockResolvedValue({
        id: 'sv-1',
        companyId: 'company-test',
        deletedAt: null,
        requesterId: TEST_USER.id,
        items: [],
        requester: { teamId: TEST_USER.teamId },
      });
    await service.submit(TEST_USER, 'sv-1');
    expect(assertChain).toHaveBeenCalledWith(TEST_USER.teamId);
    expect(startApproval).toHaveBeenCalled();
    const upd = firstArg<{ data: { status: string } }>(
      prisma.fundRequest.update,
    );
    expect(upd.data.status).toBe('IN_APPROVAL');
  });

  it('findOne: BLOQUEIA SV de outro solicitante (own-only; admin vê via simulação)', async () => {
    prisma.fundRequest.findUnique.mockResolvedValue({
      id: 'sv-1',
      companyId: 'company-test',
      deletedAt: null,
      items: [],
      requesterId: 'outro-user',
      requester: { teamId: 'outra-equipe' },
    });
    await expect(service.findOne(TEST_USER, 'sv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('findOne: LIBERA a própria SV', async () => {
    prisma.fundRequest.findUnique.mockResolvedValue({
      id: 'sv-1',
      companyId: 'company-test',
      deletedAt: null,
      items: [],
      requesterId: TEST_USER.id,
      requester: { teamId: TEST_USER.teamId },
    });
    await expect(service.findOne(TEST_USER, 'sv-1')).resolves.toBeDefined();
  });
});
