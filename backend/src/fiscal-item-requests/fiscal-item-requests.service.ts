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
import { ApproveFiscalItemRequestDto } from './dto/resolve-fiscal-item-request.dto';
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

  /**
   * Abre uma pendência fiscal de VÍNCULO item-fornecedor. O cadastro de
   * itens novos é feito diretamente no Linx — o P2P só vincula.
   */
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
    if (!dto.itemErpCode) {
      throw new BadRequestException('Informe o código do item para o vínculo.');
    }
    const item = await this.integration.findItem(
      company.code,
      dto.itemErpCode,
    );
    if (!item) {
      throw new BadRequestException('Item não encontrado no catálogo.');
    }
    return this.prisma.fiscalItemRequest.create({
      data: {
        companyId: dto.companyId,
        type: 'LINK',
        status: 'PENDING',
        supplierErpCode: dto.supplierErpCode,
        supplierName: supplier.nome,
        itemErpCode: dto.itemErpCode,
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
   * Aprova a pendência e grava o vínculo item-fornecedor no Linx
   * (SS_ITEM_FISCAL_FORNECEDOR).
   *
   * A equipe Fiscal não rejeita: se discordar do item, informa em
   * `itemErpCode` o item correto — o vínculo é feito com ele e o
   * solicitante é notificado da alteração.
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

    // Item a vincular: o original, ou o corrigido pela equipe Fiscal.
    let itemCode = req.itemErpCode as string;
    const itemChanged = !!dto.itemErpCode && dto.itemErpCode !== itemCode;
    if (itemChanged) {
      const corrected = await this.integration.findItem(
        company.code,
        dto.itemErpCode as string,
      );
      if (!corrected) {
        throw new BadRequestException(
          'Item corrigido não encontrado no catálogo do Linx.',
        );
      }
      itemCode = dto.itemErpCode as string;
    }

    await this.integration.linkSupplierItem(
      company.erpDbName,
      req.supplierErpCode,
      itemCode,
    );

    const updated = await this.prisma.fiscalItemRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        itemErpCode: itemCode,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });

    // Notifica o solicitante se a equipe Fiscal trocou o item.
    if (itemChanged) {
      await this.prisma.notification.create({
        data: {
          companyId: req.companyId,
          userId: req.requestedById,
          type: 'GENERAL',
          title: 'Item alterado pela equipe Fiscal',
          body:
            `A equipe Fiscal vinculou o item ${itemCode} no lugar de ` +
            `${req.itemErpCode} na pendência "${req.itemDescription}".`,
          entityType: 'FISCAL_ITEM_REQUEST',
          entityId: req.id,
        },
      });
    }
    return updated;
  }
}
