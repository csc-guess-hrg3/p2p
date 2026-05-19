import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateFiscalItemRequestDto } from './dto/create-fiscal-item-request.dto';
import {
  ApproveFiscalItemRequestDto,
  RejectFiscalItemRequestDto,
} from './dto/resolve-fiscal-item-request.dto';
import { QueryFiscalItemRequestsDto } from './dto/query-fiscal-item-requests.dto';

const REQUESTER = { select: { id: true, name: true } };

@Injectable()
export class FiscalItemRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  /** O usuário pertence à equipe Fiscal? */
  private async isFiscalUser(user: AuthenticatedUser): Promise<boolean> {
    if (!user.teamId) return false;
    const team = await this.prisma.team.findUnique({
      where: { id: user.teamId },
    });
    return !!team?.isFiscal;
  }

  private async assertFiscalUser(user: AuthenticatedUser) {
    if (!(await this.isFiscalUser(user))) {
      throw new ForbiddenException(
        'Apenas a equipe Fiscal pode resolver pendências de item.',
      );
    }
  }

  /** Abre uma pendência fiscal (vínculo de item ou cadastro de item novo). */
  async create(user: AuthenticatedUser, dto: CreateFiscalItemRequestDto) {
    if (!user.companyIds.includes(dto.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: dto.companyId },
    });
    const supplier = await this.integration.findSupplier(
      company.code,
      dto.supplierErpCode,
    );
    if (!supplier) {
      throw new BadRequestException('Fornecedor não encontrado no ERP.');
    }
    if (dto.type === 'LINK') {
      if (!dto.itemErpCode) {
        throw new BadRequestException(
          'Informe o código do item para o vínculo.',
        );
      }
      const item = await this.integration.findItem(
        company.code,
        dto.itemErpCode,
      );
      if (!item) {
        throw new BadRequestException('Item não encontrado no catálogo.');
      }
    }
    return this.prisma.fiscalItemRequest.create({
      data: {
        companyId: dto.companyId,
        type: dto.type,
        status: 'PENDING',
        supplierErpCode: dto.supplierErpCode,
        supplierName: supplier.nome,
        itemErpCode: dto.type === 'LINK' ? dto.itemErpCode : null,
        itemDescription: dto.itemDescription,
        unit: dto.unit ?? null,
        requestedById: user.id,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * Lista pendências. A equipe Fiscal vê todas do seu escopo de empresas;
   * os demais veem apenas as que abriram.
   */
  async findAll(user: AuthenticatedUser, query: QueryFiscalItemRequestsDto) {
    const fiscal = await this.isFiscalUser(user);
    const { companyId, status, skip = 0, take = 50 } = query;
    const where: Prisma.FiscalItemRequestWhereInput = {
      companyId:
        companyId && user.companyIds.includes(companyId)
          ? companyId
          : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(fiscal ? {} : { requestedById: user.id }),
    };
    const [data, total] = await Promise.all([
      this.prisma.fiscalItemRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
      }),
      this.prisma.fiscalItemRequest.count({ where }),
    ]);
    return { data, total, skip, take, isFiscalUser: fiscal };
  }

  /** Detalhe de uma pendência fiscal. */
  async findOne(user: AuthenticatedUser, id: string) {
    const req = await this.prisma.fiscalItemRequest.findUnique({
      where: { id },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });
    if (!req) {
      throw new NotFoundException('Pendência fiscal não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta pendência.');
    }
    return req;
  }

  /**
   * Aprova a pendência e efetiva a gravação no Linx:
   *  LINK — grava o vínculo em SS_ITEM_FISCAL_FORNECEDOR;
   *  NEW  — cadastra o item em CADASTRO_ITEM_FISCAL e o vincula ao fornecedor.
   */
  async approve(
    user: AuthenticatedUser,
    id: string,
    dto: ApproveFiscalItemRequestDto,
  ) {
    await this.assertFiscalUser(user);
    const req = await this.findOne(user, id);
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Esta pendência já foi resolvida.');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: req.companyId },
    });

    let itemErpCode = req.itemErpCode;
    if (req.type === 'LINK') {
      await this.integration.linkSupplierItem(
        company.erpDbName,
        req.supplierErpCode,
        req.itemErpCode as string,
      );
    } else {
      const codigo = dto.itemErpCode?.trim();
      if (!codigo) {
        throw new BadRequestException(
          'Informe o código do item a cadastrar no Linx.',
        );
      }
      const unidade = (dto.unit ?? req.unit ?? '').trim();
      if (!unidade) {
        throw new BadRequestException('Informe a unidade do item.');
      }
      await this.integration.createFiscalItem(company.erpDbName, {
        codigo,
        descricao: req.itemDescription,
        unidade,
        contaContabil: dto.accountingAccount ?? null,
        rateioFilial: dto.branchRateioCode ?? null,
        rateioCc: dto.costCenterRateioCode ?? null,
      });
      await this.integration.linkSupplierItem(
        company.erpDbName,
        req.supplierErpCode,
        codigo,
      );
      itemErpCode = codigo;
    }

    return this.prisma.fiscalItemRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        itemErpCode,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });
  }

  /** Rejeita a pendência fiscal. */
  async reject(
    user: AuthenticatedUser,
    id: string,
    dto: RejectFiscalItemRequestDto,
  ) {
    await this.assertFiscalUser(user);
    const req = await this.findOne(user, id);
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Esta pendência já foi resolvida.');
    }
    return this.prisma.fiscalItemRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.reason,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });
  }
}
