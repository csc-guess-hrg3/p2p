import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApprovalEntityType,
  ApprovalStepStatus,
  NotificationType,
  PurchaseOrderStatus,
  RequisitionStatus,
  FundRequestStatus,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';

interface StartApprovalParams {
  companyId: string;
  entityType: string;
  amount: number;
  requisitionId?: string;
  purchaseOrderId?: string;
  fundRequestId?: string;
  documentNumber: string;
}

/**
 * Motor de aprovação sequencial — compartilhado por Requisição, PC e SV.
 *
 * Regras:
 * - As alçadas (ApprovalTier) são níveis sequenciais com teto de valor.
 * - Um documento gera steps do nível 1 até o primeiro nível cujo teto
 *   cobre o valor (maxAmount nulo = sem limite).
 * - Qualquer membro da alçada pode decidir o step daquele nível.
 * - Rejeição em qualquer nível encerra o processo.
 */
@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtro Prisma para os steps do mesmo documento. */
  private entityFilter(step: {
    requisitionId: string | null;
    purchaseOrderId: string | null;
    fundRequestId: string | null;
  }): Prisma.ApprovalStepWhereInput {
    if (step.requisitionId) return { requisitionId: step.requisitionId };
    if (step.purchaseOrderId)
      return { purchaseOrderId: step.purchaseOrderId };
    return { fundRequestId: step.fundRequestId };
  }

  /** Cria as notificações de "aprovação pendente" para os membros da alçada. */
  private async notifyTier(
    tierId: string,
    companyId: string,
    entityType: string,
    entityId: string,
    documentNumber: string,
  ): Promise<void> {
    const members = await this.prisma.userApprovalTier.findMany({
      where: { tierId },
      select: { userId: true },
    });
    if (members.length === 0) return;
    await this.prisma.notification.createMany({
      data: members.map((m) => ({
        companyId,
        userId: m.userId,
        type: NotificationType.APPROVAL_REQUIRED,
        title: 'Aprovação pendente',
        body: `O documento ${documentNumber} aguarda sua aprovação.`,
        entityType,
        entityId,
      })),
    });
  }

  /**
   * Inicia o fluxo de aprovação de um documento: gera os steps das
   * alçadas necessárias e notifica o primeiro nível.
   * Retorna o nível inicial em aprovação.
   */
  async startApproval(params: StartApprovalParams): Promise<number> {
    const tiers = await this.prisma.approvalTier.findMany({
      where: { companyId: params.companyId, active: true },
      orderBy: { level: 'asc' },
      include: { _count: { select: { approvers: true } } },
    });
    if (tiers.length === 0) {
      throw new BadRequestException(
        'Nenhuma alçada de aprovação configurada para a empresa.',
      );
    }

    // Alçadas necessárias: nível 1 até o primeiro que cobre o valor.
    const needed: typeof tiers = [];
    for (const tier of tiers) {
      needed.push(tier);
      const max = tier.maxAmount === null ? null : Number(tier.maxAmount);
      if (max === null || max >= params.amount) break;
    }

    // Toda alçada do caminho precisa ter aprovadores, senão trava.
    const semAprovador = needed.find((t) => t._count.approvers === 0);
    if (semAprovador) {
      throw new BadRequestException(
        `A alçada "${semAprovador.name}" não tem aprovadores configurados.`,
      );
    }

    const entityId =
      params.requisitionId ??
      params.purchaseOrderId ??
      (params.fundRequestId as string);

    await this.prisma.approvalStep.createMany({
      data: needed.map((tier) => ({
        companyId: params.companyId,
        entityType: params.entityType,
        requisitionId: params.requisitionId ?? null,
        purchaseOrderId: params.purchaseOrderId ?? null,
        fundRequestId: params.fundRequestId ?? null,
        tierId: tier.id,
        level: tier.level,
        status: ApprovalStepStatus.PENDING,
      })),
    });

    await this.notifyTier(
      needed[0].id,
      params.companyId,
      params.entityType,
      entityId,
      params.documentNumber,
    );
    return needed[0].level;
  }

  /** Lista os steps pendentes que o usuário pode decidir agora. */
  async pendingForUser(user: AuthenticatedUser) {
    const tiers = await this.prisma.userApprovalTier.findMany({
      where: { userId: user.id },
      select: { tierId: true },
    });
    const tierIds = tiers.map((t) => t.tierId);
    if (tierIds.length === 0) return [];

    const steps = await this.prisma.approvalStep.findMany({
      where: {
        status: ApprovalStepStatus.PENDING,
        tierId: { in: tierIds },
        companyId: { in: user.companyIds },
      },
      include: {
        tier: { select: { name: true, level: true } },
        requisition: {
          select: {
            id: true,
            number: true,
            title: true,
            totalAmount: true,
            requester: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mantém apenas os steps do nível ativo (sem nível anterior pendente).
    const active: typeof steps = [];
    for (const step of steps) {
      const lowerPending = await this.prisma.approvalStep.count({
        where: {
          ...this.entityFilter(step),
          level: { lt: step.level },
          status: ApprovalStepStatus.PENDING,
        },
      });
      if (lowerPending === 0) active.push(step);
    }
    return active;
  }

  /** Registra a decisão (aprovar/rejeitar) de um step. */
  async decide(
    user: AuthenticatedUser,
    stepId: string,
    approved: boolean,
    comments?: string,
  ) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: { tier: { include: { approvers: true } } },
    });
    if (!step) throw new NotFoundException('Etapa de aprovação não encontrada.');
    if (step.status !== ApprovalStepStatus.PENDING) {
      throw new BadRequestException('Esta etapa já foi decidida.');
    }
    if (!step.tier.approvers.some((a) => a.userId === user.id)) {
      throw new ForbiddenException('Você não faz parte desta alçada.');
    }

    // RN-ALC-03: o solicitante nunca pode aprovar o próprio documento.
    const requesterId = await this.documentRequester(step);
    if (requesterId && requesterId === user.id) {
      throw new ForbiddenException(
        'Você não pode aprovar um documento que você mesmo solicitou.',
      );
    }

    const filter = this.entityFilter(step);
    const lowerPending = await this.prisma.approvalStep.count({
      where: {
        ...filter,
        level: { lt: step.level },
        status: ApprovalStepStatus.PENDING,
      },
    });
    if (lowerPending > 0) {
      throw new BadRequestException(
        'Há níveis de aprovação anteriores ainda pendentes.',
      );
    }

    await this.prisma.approvalStep.update({
      where: { id: stepId },
      data: {
        status: approved
          ? ApprovalStepStatus.APPROVED
          : ApprovalStepStatus.REJECTED,
        approverId: user.id,
        decidedAt: new Date(),
        comments: comments ?? null,
      },
    });

    if (!approved) {
      await this.updateEntityStatus(step, false, comments);
      return { result: 'REJECTED' as const };
    }

    const next = await this.prisma.approvalStep.findFirst({
      where: {
        ...filter,
        level: { gt: step.level },
        status: ApprovalStepStatus.PENDING,
      },
      orderBy: { level: 'asc' },
    });

    if (next) {
      await this.notifyTier(
        next.tierId,
        step.companyId,
        step.entityType,
        next.requisitionId ??
          next.purchaseOrderId ??
          (next.fundRequestId as string),
        await this.documentNumber(step),
      );
      await this.updateEntityCurrentLevel(step, next.level);
      return { result: 'PENDING' as const, nextLevel: next.level };
    }

    await this.updateEntityStatus(step, true);
    return { result: 'APPROVED' as const };
  }

  /** Solicitante/comprador do documento (para RN-ALC-03). */
  private async documentRequester(step: {
    requisitionId: string | null;
    purchaseOrderId: string | null;
    fundRequestId: string | null;
  }): Promise<string | null> {
    if (step.requisitionId) {
      const r = await this.prisma.requisition.findUnique({
        where: { id: step.requisitionId },
        select: { requesterId: true },
      });
      return r?.requesterId ?? null;
    }
    if (step.purchaseOrderId) {
      const p = await this.prisma.purchaseOrder.findUnique({
        where: { id: step.purchaseOrderId },
        select: { buyerId: true },
      });
      return p?.buyerId ?? null;
    }
    const f = await this.prisma.fundRequest.findUnique({
      where: { id: step.fundRequestId as string },
      select: { requesterId: true },
    });
    return f?.requesterId ?? null;
  }

  /** Remove o fluxo de aprovação de uma requisição (para reinício após edição). */
  async resetForRequisition(requisitionId: string): Promise<void> {
    await this.prisma.approvalStep.deleteMany({ where: { requisitionId } });
  }

  /** Número do documento (para mensagens de notificação). */
  private async documentNumber(step: {
    requisitionId: string | null;
    purchaseOrderId: string | null;
    fundRequestId: string | null;
  }): Promise<string> {
    if (step.requisitionId) {
      const r = await this.prisma.requisition.findUnique({
        where: { id: step.requisitionId },
        select: { number: true },
      });
      return r?.number ?? '';
    }
    if (step.purchaseOrderId) {
      const p = await this.prisma.purchaseOrder.findUnique({
        where: { id: step.purchaseOrderId },
        select: { number: true },
      });
      return p?.number ?? '';
    }
    const f = await this.prisma.fundRequest.findUnique({
      where: { id: step.fundRequestId as string },
      select: { number: true },
    });
    return f?.number ?? '';
  }

  /** Atualiza o nível de aprovação corrente do documento. */
  private async updateEntityCurrentLevel(
    step: {
      entityType: string;
      requisitionId: string | null;
      purchaseOrderId: string | null;
      fundRequestId: string | null;
    },
    level: number,
  ): Promise<void> {
    if (step.entityType === ApprovalEntityType.REQUISITION) {
      await this.prisma.requisition.update({
        where: { id: step.requisitionId as string },
        data: { currentTierLevel: level },
      });
    } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
      await this.prisma.purchaseOrder.update({
        where: { id: step.purchaseOrderId as string },
        data: { currentTierLevel: level },
      });
    } else {
      await this.prisma.fundRequest.update({
        where: { id: step.fundRequestId as string },
        data: { currentTierLevel: level },
      });
    }
  }

  /** Aplica o resultado final (aprovado/rejeitado) no documento. */
  private async updateEntityStatus(
    step: {
      entityType: string;
      requisitionId: string | null;
      purchaseOrderId: string | null;
      fundRequestId: string | null;
    },
    approved: boolean,
    rejectionReason?: string,
  ): Promise<void> {
    const now = new Date();
    if (step.entityType === ApprovalEntityType.REQUISITION) {
      await this.prisma.requisition.update({
        where: { id: step.requisitionId as string },
        data: approved
          ? { status: RequisitionStatus.APPROVED, approvedAt: now }
          : {
              status: RequisitionStatus.REJECTED,
              rejectedAt: now,
              rejectionReason: rejectionReason ?? null,
            },
      });
    } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
      await this.prisma.purchaseOrder.update({
        where: { id: step.purchaseOrderId as string },
        data: approved
          ? { status: PurchaseOrderStatus.APPROVED, approvedAt: now }
          : {
              status: PurchaseOrderStatus.CANCELLED,
              cancelledAt: now,
              cancellationReason: rejectionReason ?? null,
            },
      });
    } else {
      await this.prisma.fundRequest.update({
        where: { id: step.fundRequestId as string },
        data: approved
          ? { status: FundRequestStatus.APPROVED, approvedAt: now }
          : {
              status: FundRequestStatus.REJECTED,
              rejectedAt: now,
              rejectionReason: rejectionReason ?? null,
            },
      });
    }
  }
}
