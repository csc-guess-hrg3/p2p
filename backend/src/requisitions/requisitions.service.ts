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
import { ApprovalsService } from '../approvals/approvals.service';
import {
  ApprovalEntityType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
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
    private readonly approvals: ApprovalsService,
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

  /** Carrega os rateios liberados para a equipe na empresa. */
  private async loadTeamRateios(
    teamId: string | null,
    companyId: string,
  ): Promise<{ branch: Set<string>; cc: Set<string> } | null> {
    if (!teamId) return null; // sem equipe (ex.: admin) — sem restrição
    const [branch, cc] = await Promise.all([
      this.prisma.teamBranchRateio.findMany({ where: { teamId, companyId } }),
      this.prisma.teamCostCenterRateio.findMany({
        where: { teamId, companyId },
      }),
    ]);
    return {
      branch: new Set(branch.map((b) => b.branchRateioCode)),
      cc: new Set(cc.map((c) => c.costCenterRateioCode)),
    };
  }

  /**
   * Congela as linhas de um rateio: valida soma = 100% e calcula os
   * valores; a última linha absorve o resíduo de arredondamento.
   */
  private snapshotLines(
    kind: 'BRANCH' | 'COST_CENTER',
    rateioCode: string,
    rawLines: { targetCode: string; branchCode: string | null; percentage: number }[],
    total: number,
  ) {
    if (rawLines.length === 0) {
      throw new BadRequestException(
        `O rateio ${rateioCode} não tem linhas no ERP.`,
      );
    }
    const sumPct = rawLines.reduce((s, l) => s + l.percentage, 0);
    if (Math.abs(sumPct - 100) > 0.01) {
      throw new BadRequestException(
        `O rateio ${rateioCode} soma ${sumPct.toFixed(2)}% — deveria somar 100%.`,
      );
    }
    let allocated = 0;
    return rawLines.map((l, i) => {
      const isLast = i === rawLines.length - 1;
      const amount = isLast
        ? Number((total - allocated).toFixed(2))
        : Number(((total * l.percentage) / 100).toFixed(2));
      allocated += amount;
      return {
        kind,
        rateioCode,
        targetCode: l.targetCode,
        branchCode: l.branchCode,
        percentage: l.percentage,
        amount,
      };
    });
  }

  /** Valida itens contra o ERP (+ escopo da equipe) e monta os dados + total. */
  private async buildItems(
    companyCode: string,
    items: CreateRequisitionItemDto[],
    teamRateios: { branch: Set<string>; cc: Set<string> } | null,
  ) {
    const built: {
      fields: Prisma.RequisitionItemCreateWithoutRequisitionInput;
    }[] = [];
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

      // Escopo da equipe: o item só pode usar rateios liberados para ela.
      if (teamRateios) {
        if (!teamRateios.branch.has(it.branchRateioCode)) {
          throw new BadRequestException(
            `O rateio de filial ${it.branchRateioCode} não está liberado para a sua equipe.`,
          );
        }
        if (!teamRateios.cc.has(it.costCenterRateioCode)) {
          throw new BadRequestException(
            `O rateio de centro de custo ${it.costCenterRateioCode} não está liberado para a sua equipe.`,
          );
        }
      }

      const totalPrice = Number((it.quantity * it.estimatedPrice).toFixed(2));
      totalAmount += totalPrice;

      // Snapshot do rateio — congela as linhas no momento da criação.
      const branchLines = await this.integration.getBranchRateioLines(
        companyCode,
        it.branchRateioCode,
      );
      const ccLines = await this.integration.getCostCenterRateioLines(
        companyCode,
        it.costCenterRateioCode,
      );
      const rateioSnapshot = [
        ...this.snapshotLines(
          'BRANCH',
          it.branchRateioCode,
          branchLines.map((l) => ({
            targetCode: l.filialCodigo,
            branchCode: null,
            percentage: l.porcentagem,
          })),
          totalPrice,
        ),
        ...this.snapshotLines(
          'COST_CENTER',
          it.costCenterRateioCode,
          ccLines.map((l) => ({
            targetCode: l.centroCustoCodigo,
            branchCode: l.filialCodigo,
            percentage: l.porcentagem,
          })),
          totalPrice,
        ),
      ];

      built.push({
        fields: {
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
          rateios: { create: rateioSnapshot },
        },
      });
    }

    return { built, totalAmount: Number(totalAmount.toFixed(2)) };
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

    const paymentCondition = await this.integration.findPaymentCondition(
      company.code,
      dto.paymentConditionCode,
    );
    if (!paymentCondition) {
      throw new BadRequestException(
        `Condição de pagamento inválida: ${dto.paymentConditionCode}`,
      );
    }

    const teamRateios = await this.loadTeamRateios(user.teamId, company.id);
    const { built, totalAmount } = await this.buildItems(
      company.code,
      dto.items,
      teamRateios,
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
        teamId: user.teamId,
        title: dto.title,
        justification: dto.justification,
        tipoNotaFiscal: dto.tipoNotaFiscal,
        status: RequisitionStatus.DRAFT,
        totalAmount,
        paymentConditionCode: dto.paymentConditionCode,
        paymentConditionDesc: paymentCondition.descricao,
        recurring: dto.recurring ?? false,
        recurrenceMonths: dto.recurring ? (dto.recurrenceMonths ?? null) : null,
        contractRef: dto.contractRef ?? null,
        tipoCompra: dto.tipoCompra ?? null,
        items: { create: built.map((b) => b.fields) },
      },
      include: { items: { include: { rateios: true } } },
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
      // Escopo de visibilidade: não-admin vê só a própria equipe.
      ...(user.profile !== UserProfile.ADMIN
        ? { teamId: user.teamId }
        : {}),
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
        items: { include: { rateios: true } },
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

    if (
      req.status !== RequisitionStatus.DRAFT &&
      req.status !== RequisitionStatus.IN_APPROVAL
    ) {
      throw new BadRequestException(
        'Só requisições em rascunho ou em aprovação podem ser editadas.',
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
    if (dto.recurring !== undefined) {
      data.recurring = dto.recurring;
      data.recurrenceMonths = dto.recurring
        ? (dto.recurrenceMonths ?? null)
        : null;
    }
    if (dto.contractRef !== undefined) {
      data.contractRef = dto.contractRef || null;
    }
    if (dto.paymentConditionCode !== undefined) {
      const cond = await this.integration.findPaymentCondition(
        company.code,
        dto.paymentConditionCode,
      );
      if (!cond) {
        throw new BadRequestException(
          `Condição de pagamento inválida: ${dto.paymentConditionCode}`,
        );
      }
      data.paymentConditionCode = dto.paymentConditionCode;
      data.paymentConditionDesc = cond.descricao;
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
      const teamRateios = await this.loadTeamRateios(
        user.teamId,
        company.id,
      );
      const { built, totalAmount } = await this.buildItems(
        company.code,
        dto.items,
        teamRateios,
      );
      data.totalAmount = totalAmount;

      const oldItems = await this.prisma.requisitionItem.findMany({
        where: { requisitionId: id },
        select: { id: true },
      });
      const oldIds = oldItems.map((o) => o.id);

      // Apaga o snapshot antigo, depois os itens, e recria com snapshot novo.
      await this.prisma.$transaction([
        this.prisma.requisitionItemRateio.deleteMany({
          where: { requisitionItemId: { in: oldIds } },
        }),
        this.prisma.requisitionItem.deleteMany({
          where: { requisitionId: id },
        }),
        ...built.map((b) =>
          this.prisma.requisitionItem.create({
            data: { ...b.fields, requisitionId: id },
          }),
        ),
      ]);
    }

    await this.prisma.requisition.update({ where: { id }, data });

    // RN-REQ-05: edição após o envio reinicia o fluxo de aprovação.
    if (req.status === RequisitionStatus.IN_APPROVAL) {
      await this.approvals.resetForRequisition(id);
      const updated = await this.prisma.requisition.findUniqueOrThrow({
        where: { id },
      });
      const firstLevel = await this.approvals.startApproval({
        companyId: updated.companyId,
        teamId: updated.teamId,
        entityType: ApprovalEntityType.REQUISITION,
        requisitionId: id,
        amount: Number(updated.totalAmount),
        documentNumber: updated.number,
      });
      await this.prisma.requisition.update({
        where: { id },
        data:
          firstLevel === null
            ? { status: RequisitionStatus.APPROVED, approvedAt: new Date() }
            : { currentTierLevel: firstLevel },
      });
    }
    return this.findOne(user, id);
  }

  /** Submete a requisição: gera o fluxo de aprovação por alçada. */
  async submit(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);

    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas requisições em rascunho podem ser submetidas.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode submeter.');
    }
    if (req.items.length === 0) {
      throw new BadRequestException('A requisição não tem itens.');
    }

    const firstLevel = await this.approvals.startApproval({
      companyId: req.companyId,
      teamId: req.teamId,
      entityType: ApprovalEntityType.REQUISITION,
      requisitionId: req.id,
      amount: Number(req.totalAmount),
      documentNumber: req.number,
    });

    // Cadeia vazia → auto-aprovado já na submissão.
    await this.prisma.requisition.update({
      where: { id },
      data:
        firstLevel === null
          ? {
              status: RequisitionStatus.APPROVED,
              submittedAt: new Date(),
              approvedAt: new Date(),
            }
          : {
              status: RequisitionStatus.IN_APPROVAL,
              submittedAt: new Date(),
              currentTierLevel: firstLevel,
            },
    });
    return this.findOne(user, id);
  }

  /**
   * Preenche a classificação fiscal da requisição (CTB + natureza,
   * opcionalmente tipoCompra). Restrito a REVIEWER/ADMIN. Pode ser
   * chamado antes ou depois da aprovação — mas obrigatório antes da
   * conversão em PC (a gravação no Linx exige esses campos).
   */
  async fiscalClassify(
    user: AuthenticatedUser,
    id: string,
    dto: { ctbTipoOperacao: number; naturezaEntrada: string; tipoCompra?: string },
  ) {
    if (
      user.profile !== UserProfile.REVIEWER &&
      user.profile !== UserProfile.ADMIN
    ) {
      throw new ForbiddenException(
        'Somente o fiscal/revisor pode classificar fiscalmente.',
      );
    }
    const req = await this.findOne(user, id);
    if (req.status === RequisitionStatus.CONVERTED) {
      throw new BadRequestException(
        'Requisição já convertida em PC — não é possível reclassificar.',
      );
    }
    await this.prisma.requisition.update({
      where: { id },
      data: {
        ctbTipoOperacao: dto.ctbTipoOperacao,
        naturezaEntrada: dto.naturezaEntrada,
        ...(dto.tipoCompra ? { tipoCompra: dto.tipoCompra } : {}),
      },
    });
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
