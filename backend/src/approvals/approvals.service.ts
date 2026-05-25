import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { LinxErpService } from '../integration/linx-erp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalEngineService } from './approval-engine.service';

interface StartApprovalParams {
  companyId: string;
  teamId: string | null;
  entityType: string;
  amount: number;
  requisitionId?: string;
  purchaseOrderId?: string;
  fundRequestId?: string;
  documentNumber: string;
}

/**
 * Motor de aprovação sequencial — por cadeia de equipe.
 *
 * Cada equipe tem sua própria cadeia (TeamApprovalLevel): níveis
 * ordenados, cada um com um aprovador e uma alçada (maxAmount).
 *
 * - Um documento gera steps do nível 1 até o primeiro nível cuja
 *   alçada cobre o valor (maxAmount nulo = sem limite).
 * - Cadeia vazia (ou sem equipe) = documento auto-aprovado.
 * - Cada nível tem um aprovador; a ausência é coberta por delegação.
 * - Rejeição em qualquer nível encerra o processo.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
    private readonly notifications: NotificationsService,
    private readonly engine: ApprovalEngineService,
  ) {}

  /** Notifica o aprovador de um nível que há documento aguardando-o. */
  private async notifyApprover(
    approverId: string,
    companyId: string,
    entityType: string,
    entityId: string,
    documentNumber: string,
  ): Promise<void> {
    await this.notifications.create({
      companyId,
      userId: approverId,
      type: NotificationType.APPROVAL_REQUIRED,
      title: `Aprovação pendente: ${documentNumber}`,
      body: `O documento ${documentNumber} aguarda sua aprovação.`,
      entityType,
      entityId,
      sendEmail: true,
    });
  }

  /**
   * Inicia o fluxo de aprovação. Gera os steps da cadeia da equipe.
   * Retorna o nível inicial, ou null se a cadeia for vazia (auto-aprovado).
   */
  async startApproval(params: StartApprovalParams): Promise<number | null> {
    if (!params.teamId) return null; // sem equipe = sem cadeia = auto-aprovado

    const levels = await this.prisma.teamApprovalLevel.findMany({
      where: { teamId: params.teamId },
      orderBy: { level: 'asc' },
    });
    if (levels.length === 0) return null; // cadeia vazia = auto-aprovado

    // Níveis necessários: do 1 até o primeiro que cobre o valor.
    const needed: typeof levels = [];
    for (const lvl of levels) {
      needed.push(lvl);
      const max = lvl.maxAmount === null ? null : Number(lvl.maxAmount);
      if (max === null || max >= params.amount) break;
    }

    const entityId =
      params.requisitionId ??
      params.purchaseOrderId ??
      (params.fundRequestId as string);

    await this.prisma.approvalStep.createMany({
      data: needed.map((lvl) => ({
        companyId: params.companyId,
        entityType: params.entityType,
        requisitionId: params.requisitionId ?? null,
        purchaseOrderId: params.purchaseOrderId ?? null,
        fundRequestId: params.fundRequestId ?? null,
        teamApprovalLevelId: lvl.id,
        level: lvl.level,
        levelName: lvl.name,
        assignedApproverId: lvl.approverId,
        status: ApprovalStepStatus.PENDING,
      })),
    });

    // Notificação: quando o primeiro nível tem aprovador fixo, avisa direto.
    // Para níveis dinâmicos (por cargo), a notificação será resolvida na
    // próxima fase quando o engine souber quem são os candidatos.
    if (needed[0].approverId) {
      await this.notifyApprover(
        needed[0].approverId,
        params.companyId,
        params.entityType,
        entityId,
        params.documentNumber,
      );
    }
    return needed[0].level;
  }

  /** Remove o fluxo de aprovação de uma requisição (reinício após edição). */
  async resetForRequisition(requisitionId: string): Promise<void> {
    await this.prisma.approvalStep.deleteMany({ where: { requisitionId } });
  }

  /** Remove o fluxo de aprovação de um PC (reinício após edição). */
  async resetForPurchaseOrder(purchaseOrderId: string): Promise<void> {
    await this.prisma.approvalStep.deleteMany({ where: { purchaseOrderId } });
  }

  /** Lista os steps pendentes que o usuário pode decidir agora. */
  async pendingForUser(user: AuthenticatedUser) {
    const approverIds = await this.engine.getActingApproverIds(user.id);

    const steps = await this.prisma.approvalStep.findMany({
      where: {
        status: ApprovalStepStatus.PENDING,
        assignedApproverId: { in: approverIds },
        companyId: { in: user.companyIds },
      },
      include: {
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
          ...this.engine.entityFilter(step),
          level: { lt: step.level },
          status: ApprovalStepStatus.PENDING,
        },
      });
      if (lowerPending === 0) active.push(step);
    }
    return active;
  }

  /**
   * Lista as requisições do próprio usuário que estão aguardando aprovação
   * — visão do solicitante. Mostra em que nível paramos e quem é o
   * aprovador atual, pra ele saber por quem está esperando.
   */
  async mineWaitingApproval(user: AuthenticatedUser) {
    const reqs = await this.prisma.requisition.findMany({
      where: {
        requesterId: user.id,
        status: { in: ['SUBMITTED', 'IN_APPROVAL', 'REVISION'] },
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        title: true,
        totalAmount: true,
        status: true,
        submittedAt: true,
        currentTierLevel: true,
        approvalSteps: {
          where: { status: ApprovalStepStatus.PENDING },
          orderBy: { level: 'asc' },
          select: {
            level: true,
            levelName: true,
            assignedApprover: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return reqs.map((r) => {
      // Step ativo = primeiro pendente (menor level).
      const active = r.approvalSteps[0] ?? null;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        totalAmount: r.totalAmount,
        status: r.status,
        submittedAt: r.submittedAt,
        currentLevel: active?.level ?? r.currentTierLevel ?? null,
        currentLevelName: active?.levelName ?? null,
        currentApprover: active?.assignedApprover ?? null,
      };
    });
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
    });
    if (!step) throw new NotFoundException('Etapa de aprovação não encontrada.');
    if (step.status !== ApprovalStepStatus.PENDING) {
      throw new BadRequestException('Esta etapa já foi decidida.');
    }

    // O usuário precisa ser o aprovador do nível — direto, por delegação,
    // ou (na cadeia dinâmica — Fase 1) ter o cargo + filial correspondentes
    // ao nível. Quando o step não tem assignedApproverId (aprovador dinâmico
    // ainda não resolvido), checamos position+branch.
    const allowed = await this.engine.userCanDecideStep(user.id, step);
    if (!allowed) {
      throw new ForbiddenException('Você não é o aprovador desta etapa.');
    }

    // RN-ALC-03: o solicitante nunca aprova o próprio documento.
    const requesterId = await this.engine.documentRequester(step);
    if (requesterId && requesterId === user.id) {
      throw new ForbiddenException(
        'Você não pode aprovar um documento que você mesmo solicitou.',
      );
    }

    const filter = this.engine.entityFilter(step);
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
        decidedById: user.id,
        decidedAt: new Date(),
        comments: comments ?? null,
      },
    });

    if (!approved) {
      await this.updateEntityStatus(step, false, comments);
      const rejectedRequesterId = await this.engine.documentRequester(step);
      if (rejectedRequesterId) {
        const docNum = await this.engine.documentNumber(step);
        await this.notifications.create({
          companyId: step.companyId,
          userId: rejectedRequesterId,
          type: NotificationType.REJECTED,
          title: `Documento rejeitado: ${docNum}`,
          body: comments
            ? `Seu documento ${docNum} foi rejeitado. Motivo: ${comments}`
            : `Seu documento ${docNum} foi rejeitado.`,
          entityType: step.entityType,
          entityId:
            step.requisitionId ??
            step.purchaseOrderId ??
            (step.fundRequestId as string),
          sendEmail: true,
        });
      }
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
      // Notificação só pra aprovador fixo. Pra dinâmico (sem assignedApproverId)
      // precisaríamos resolver os candidatos (Fase 1.5): por ora ficam só
      // visíveis na lista do `/aprovacoes` de quem tiver perfil compatível.
      if (next.assignedApproverId) {
        await this.notifyApprover(
          next.assignedApproverId,
          step.companyId,
          step.entityType,
          next.requisitionId ??
            next.purchaseOrderId ??
            (next.fundRequestId as string),
          await this.engine.documentNumber(step),
        );
      }
      await this.updateEntityCurrentLevel(step, next.level);
      return { result: 'PENDING' as const, nextLevel: next.level };
    }

    await this.updateEntityStatus(step, true);
    const approvedRequesterId = await this.engine.documentRequester(step);
    if (approvedRequesterId) {
      const docNum = await this.engine.documentNumber(step);
      await this.notifications.create({
        companyId: step.companyId,
        userId: approvedRequesterId,
        type: NotificationType.APPROVED,
        title: `Documento aprovado: ${docNum}`,
        body: `Seu documento ${docNum} foi aprovado.`,
        entityType: step.entityType,
        entityId:
          step.requisitionId ??
          step.purchaseOrderId ??
          (step.fundRequestId as string),
        sendEmail: true,
      });
    }
    return { result: 'APPROVED' as const };
  }

  /**
   * Aprovador pede ajuste em vez de aprovar/rejeitar. O documento volta
   * para o solicitante com motivo registrado; cadeia de aprovação é
   * descartada (steps PENDING são marcados como REVISION). Quando o
   * solicitante ressubmeter, nova cadeia é iniciada do zero.
   */
  async requestRevision(
    user: AuthenticatedUser,
    stepId: string,
    reason: string,
  ) {
    const trimmed = (reason ?? '').trim();
    if (trimmed.length < 5) {
      throw new BadRequestException(
        'Motivo da revisão obrigatório (mínimo 5 caracteres).',
      );
    }
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step) throw new NotFoundException('Etapa de aprovação não encontrada.');
    if (step.status !== ApprovalStepStatus.PENDING) {
      throw new BadRequestException('Esta etapa já foi decidida.');
    }
    const allowed = await this.engine.userCanDecideStep(user.id, step);
    if (!allowed) {
      throw new ForbiddenException('Você não é o aprovador desta etapa.');
    }

    const filter = this.engine.entityFilter(step);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Marca todos os steps pendentes desse doc como REVISION.
      await tx.approvalStep.updateMany({
        where: { ...filter, status: ApprovalStepStatus.PENDING },
        data: {
          status: ApprovalStepStatus.REVISION,
          decidedById: user.id,
          decidedAt: now,
          comments: trimmed,
        },
      });
      // Atualiza o documento — só Requisição e PC suportam revisão
      // (SV não tem ciclo de edição).
      if (step.entityType === ApprovalEntityType.REQUISITION) {
        await tx.requisition.update({
          where: { id: step.requisitionId as string },
          data: {
            status: RequisitionStatus.REVISION,
            revisionReason: trimmed,
            revisionRequestedAt: now,
            revisionRequestedById: user.id,
            currentTierLevel: null,
          },
        });
      } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
        await tx.purchaseOrder.update({
          where: { id: step.purchaseOrderId as string },
          data: {
            status: PurchaseOrderStatus.DRAFT,
            lastEditReason: `REVISÃO: ${trimmed}`,
          },
        });
      } else {
        throw new BadRequestException(
          'Solicitação de revisão só vale pra requisição ou pedido de compra.',
        );
      }
    });
    // Notifica o requisitante/comprador que o doc voltou pra ajuste.
    const requesterId = await this.engine.documentRequester(step);
    if (requesterId) {
      const docNum = await this.engine.documentNumber(step);
      await this.notifications.create({
        companyId: step.companyId,
        userId: requesterId,
        type: NotificationType.REVISION_REQUESTED,
        title: `Revisão solicitada: ${docNum}`,
        body: `${user.name ?? user.adUsername} pediu ajustes em ${docNum}. Motivo: ${trimmed}`,
        entityType: step.entityType,
        entityId:
          step.requisitionId ?? (step.purchaseOrderId as string),
        sendEmail: true,
      });
    }
    return { result: 'REVISION' as const };
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
      decidedById?: string | null;
      assignedApproverId?: string | null;
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
      // Reaprovação após edição: o PC tinha sido marcado 'em estudo'
      // no Linx; agora voltamos pra 'aprovado'. Idempotente — markPedido-
      // Aprovado lida com o caso de não haver erpPedido.
      if (approved) {
        // O decisor concreto sempre é gravado em decidedById no decide();
        // assignedApproverId só serve como fallback no fluxo legacy fixo.
        const deciderId =
          step.decidedById ?? step.assignedApproverId ?? undefined;
        if (!deciderId) {
          throw new Error(
            'Step sem decisor identificado — não foi possível atualizar o ERP.',
          );
        }
        const decider = await this.prisma.user.findUniqueOrThrow({
          where: { id: deciderId },
        });
        const po = await this.prisma.purchaseOrder.findUniqueOrThrow({
          where: { id: step.purchaseOrderId as string },
          select: { id: true, companyId: true, erpPedido: true, number: true },
        });
        try {
          await this.linx.markPedidoAprovado(po, {
            id: decider.id,
            name: decider.name,
            adUsername: decider.adUsername,
          } as AuthenticatedUser);
        } catch (err) {
          this.logger.warn(
            `PC ${po.number}: falha ao reabrir Linx pra 'A' após aprovação: ${(err as Error).message}`,
          );
        }
      }
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
