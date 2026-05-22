import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPrismaMock,
  PrismaMock,
  TEST_USER,
} from '../test-utils/prisma-mock';
import { ProductOrdersPaService } from './product-orders-pa.service';

/**
 * Stub mínimo de empresa+config para os testes (suficiente para passar
 * pelas guardas `resolveConfig` e `resolveErpDb`).
 */
function makeCompany(overrides: Partial<any> = {}) {
  return {
    id: 'company-test',
    code: 'GUESS',
    name: 'Guess',
    erpDbName: 'GUESS_PRODUCAO',
    deletedAt: null,
    erpConfig: {
      paApproverUserId: 'user-aprovador',
      ...overrides,
    },
  };
}

describe('ProductOrdersPaService', () => {
  let prisma: PrismaMock;
  let service: ProductOrdersPaService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ProductOrdersPaService(
      prisma as unknown as PrismaService,
    );
  });

  describe('assertCompany', () => {
    it('rejeita empresa inválida', async () => {
      await expect(
        service.findAll(TEST_USER, 'OUTRO'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('aceita company válida e passa pela view', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { pedido: '60001', status_efetivo: 'E' },
      ]);
      const rows = await service.findAll(TEST_USER, 'guess');
      expect(rows).toHaveLength(1);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('falha quando empresa não tem aprovador configurado', async () => {
      prisma.company.findFirst.mockResolvedValue(
        makeCompany({ paApproverUserId: null }),
      );
      await expect(
        service.approve(TEST_USER, 'GUESS', '60001'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('bloqueia usuário que não é o aprovador', async () => {
      prisma.company.findFirst.mockResolvedValue(makeCompany());
      await expect(
        service.approve({ ...TEST_USER, id: 'user-outro' }, 'GUESS', '60001'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita pedido inexistente', async () => {
      prisma.company.findFirst.mockResolvedValue(makeCompany());
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // header lookup
      await expect(
        service.approve(
          { ...TEST_USER, id: 'user-aprovador' },
          'GUESS',
          '99999',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita pedido fora do status E (já aprovado, p.ex.)', async () => {
      prisma.company.findFirst.mockResolvedValue(makeCompany());
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ status_compra: 'A' }]);
      await expect(
        service.approve(
          { ...TEST_USER, id: 'user-aprovador' },
          'GUESS',
          '60001',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aprova e dispara UPDATE + log no ERP, retornando detalhe', async () => {
      // resolveConfig (approve) + resolveConfig (findOne)
      prisma.company.findFirst
        .mockResolvedValueOnce(makeCompany())
        .mockResolvedValueOnce(makeCompany());
      // header lookup
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ status_compra: 'E' }]);
      // UPDATE COMPRAS + INSERT log (2 chamadas)
      prisma.$executeRawUnsafe
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      // findOne: header, items, nfs, itemNfs, statusLog (resolveErpDb -> findFirst)
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            pedido: '60001',
            status_efetivo: 'A',
            status_compra: 'A',
            cadastramento: new Date('2026-05-01'),
          },
        ]) // header
        .mockResolvedValueOnce([]) // items
        .mockResolvedValueOnce([]) // nfs
        .mockResolvedValueOnce([]); // itemNfs
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // statusLog
      // resolveErpDb dentro do findOne pra timeline
      prisma.company.findFirst.mockResolvedValueOnce(makeCompany());

      const out = await service.approve(
        { ...TEST_USER, id: 'user-aprovador' },
        'GUESS',
        '60001',
      );
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      expect(out.pedido).toBe('60001');
    });
  });

  describe('reject', () => {
    it('exige motivo com pelo menos 10 caracteres', async () => {
      prisma.company.findFirst.mockResolvedValue(makeCompany());
      await expect(
        service.reject(
          { ...TEST_USER, id: 'user-aprovador' },
          'GUESS',
          '60001',
          'curto',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('bloqueia quem não é o aprovador configurado', async () => {
      prisma.company.findFirst.mockResolvedValue(makeCompany());
      await expect(
        service.reject(
          { ...TEST_USER, id: 'user-outro' },
          'GUESS',
          '60001',
          'motivo suficientemente longo',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('devolve detalhe com items, NFs (vazias) e timeline ao menos com criação', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            pedido: '60001',
            cadastramento: new Date('2026-05-01'),
            status_compra: 'E',
            status_efetivo: 'E',
          },
        ]) // header
        .mockResolvedValueOnce([]) // items
        .mockResolvedValueOnce([]) // nfs
        .mockResolvedValueOnce([]); // itemNfs
      prisma.company.findFirst.mockResolvedValue(makeCompany()); // resolveErpDb
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // statusLog

      const out = await service.findOne(TEST_USER, 'GUESS', '60001');
      expect(out.pedido).toBe('60001');
      expect(out.timeline.length).toBeGreaterThanOrEqual(1);
      expect(out.timeline[out.timeline.length - 1].kind).toBe('created');
    });
  });
});
