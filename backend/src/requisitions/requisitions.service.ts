import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { NumberingService } from '../numbering/numbering.service';
import { RequisitionStatus, UserProfile } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateRequisitionDto,
  CreateRequisitionItemDto,
} from './dto/create-requisition.dto';
import { UpdateRequisitionDto } from './dto/update-requisition.dto';
import { QueryRequisitionsDto } from './dto/query-requisitions.dto';

@Injectable()
export class RequisitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly numbering: NumberingService,
  ) {}

  /** Garante que o usuário tem acesso à empresa e devolve o código do ERP. */
  private async resolveCompany(
    user: AuthenticatedUser,
    companyId: string,
  ): Promise<{ id: string; code: string }> {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company || company.deletedAt) {
      throw new BadRequestException('Empresa inválida.');
    }
    return { id: company.id, code: company.code };
  }

  /** Valida itens contra o ERP e monta os dados + total. */
  private async buildItems(
    companyCode: string,
    items: CreateRequisitionItemDto[],
  ) {
    const itemsData: Prisma.RequisitionItemCreateManyRequisitionInput[] = [];
    let totalAmount = 0;

    for (const it of items) {
      const account = await this.integration.findAccount(
        companyCode,
        it.accountingAccount,
      );
      if (!account) {
        throw new BadRequestException(
          `Conta contábil inválida: ${it.accountingAccount}`,
        );
      }
      const branchRateio = await this.integration.findBranchRateio(
        companyCode,
        it.branchRateioCode,
      );
      if (!branchRateio) {
        throw new BadRequestException(
          `Rateio de filial inválido: ${it.branchRateioCode}`,
        );
      }
      const ccRateio = await this.integration.findCostCenterRateio(
        companyCode,
        it.costCenterRateioCode,
      );
      if (!ccRateio) {
        throw new BadRequestException(
          `Rateio de centro de custo inválido: ${it.costCenterRateioCode}`,
        );
      }
      if (it.itemErpCode) {
        const erpItem = await this.integration.findItem(
          companyCode,
          it.itemErpCode,
        );
        if (!erpItem) {
          throw new BadRequestException(`Item inválido: ${it.itemErpCode}`);
        }
      }

      const totalPrice = Number((it.quantity * it.estimatedPrice).toFixed(2));
      totalAmount += totalPrice;
      itemsData.push({
        itemErpCode: it.itemErpCode ?? null,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        estimatedPrice: it.estimatedPrice,
        totalPrice,
        accountingAccount: it.accountingAccount,
        accountName: account.nome,
        branchRateioCode: it.branchRateioCode,
        branchRateioDesc: branchRateio.descricao,
        costCenterRateioCode: it.costCenterRateioCode,
        costCenterRateioDesc: ccRateio.descricao,
        notes: it.notes ?? null,
      });
    }

    return { itemsData, totalAmount: Number(totalAmount.toFixed(2)) };
  }

  /** Cria uma requisição em rascunho. */
  async create(user: AuthenticatedUser, dto: CreateRequisitionDto) {
    const company = await this.resolveCompany(user, dto.companyId);

    const branch = await this.integration.findBranch(
      company.code,
      dto.branchErpCode,
    );
    if (!branch) {
      throw new BadRequestException(`Filial inválida: ${dto.branchErpCode}`);
    }
    const supplier = await this.integration.findSupplier(
      company.code,
      dto.supplierErpCode,
    );
    if (!supplier) {
      throw new BadRequestException(
        `Fornecedor inválido: ${dto.supplierErpCode}`,
      );
    }

    const { itemsData, totalAmount } = await this.buildItems(
      company.code,
      dto.items,
    );
    const number = await this.numbering.next(company.code, 'REQ');

    return this.prisma.requisition.create({
      data: {
        number,
        companyId: company.id,
        branchErpCode: dto.branchErpCode,
        branchName: branch.nome,
        supplierErpCode: dto.supplierErpCode,
        supplierName: supplier.nome,
        requesterId: user.id,
        title: dto.title,
        justification: dto.justification ?? null,
        tipoNotaFiscal: dto.tipoNotaFiscal,
        status: RequisitionStatus.DRAFT,
        totalAmount,
        neededBy: dto.neededBy ? new Date(dto.neededBy) : null,
        items: { createMany: { data: itemsData } },
      },
      include: { items: true },
    });
  }

  /** Lista requisições do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryRequisitionsDto) {
    const { companyId, status, search, mine, skip = 0, take = 50 } = query;

    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }

    const where: Prisma.RequisitionWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(mine === 'true' ? { requesterId: user.id } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search } },
              { title: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { requester: { select: { id: true, name: true } } },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Detalhe de uma requisição. */
  async findOne(user: AuthenticatedUser, id: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id },
      include: {
        items: true,
        requester: { select: { id: true, name: true } },
        approvalSteps: { orderBy: { level: 'asc' } },
      },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
    return req;
  }

  /** Edita uma requisição em rascunho (apenas o solicitante ou admin). */
  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateRequisitionDto,
  ) {
    const req = await this.findOne(user, id);

    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas requisições em rascunho podem ser editadas.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode editar.');
    }

    const company = await this.resolveCompany(user, req.companyId);
    const data: Prisma.RequisitionUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.justification !== undefined) {
      data.justification = dto.justification;
    }
    if (dto.neededBy !== undefined) {
      data.neededBy = dto.neededBy ? new Date(dto.neededBy) : null;
    }
    if (dto.branchErpCode !== undefined) {
      const branch = await this.integration.findBranch(
        company.code,
        dto.branchErpCode,
      );
      if (!branch) {
        throw new BadRequestException(
          `Filial inválida: ${dto.branchErpCode}`,
        );
      }
      data.branchErpCode = dto.branchErpCode;
      data.branchName = branch.nome;
    }
    if (dto.supplierErpCode !== undefined) {
      const supplier = await this.integration.findSupplier(
        company.code,
        dto.supplierErpCode,
      );
      if (!supplier) {
        throw new BadRequestException(
          `Fornecedor inválido: ${dto.supplierErpCode}`,
        );
      }
      data.supplierErpCode = dto.supplierErpCode;
      data.supplierName = supplier.nome;
    }

    if (dto.items) {
      const { itemsData, totalAmount } = await this.buildItems(
        company.code,
        dto.items,
      );
      data.totalAmount = totalAmount;
      await this.prisma.$transaction([
        this.prisma.requisitionItem.deleteMany({
          where: { requisitionId: id },
        }),
        this.prisma.requisitionItem.createMany({
          data: itemsData.map((i) => ({ ...i, requisitionId: id })),
        }),
      ]);
    }

    await this.prisma.requisition.update({ where: { id }, data });
    return this.findOne(user, id);
  }

  /** Exclui uma requisição em rascunho (soft delete). */
  async remove(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);
    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas requisições em rascunho podem ser excluídas.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode excluir.');
    }
    await this.prisma.requisition.update({
      where: { id },
      data: { deletedAt: new Date(), status: RequisitionStatus.CANCELLED },
    });
    return { ok: true };
  }
}
