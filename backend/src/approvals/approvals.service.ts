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
  UserProfile,
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

  /**
   * Lista os steps pendentes que o usuário pode decidir agora.
   *
   * - Admin: vê TODOS os pendentes das empresas a que tem acesso (mesmo
   *   sem ser o aprovador atribuído). Isso permite destravar fluxos
   *   quando o aprovador original está fora — a decisão fica registrada
   *   como override de admin e exige justificativa.
   * - Demais perfis: só os steps onde ele é o aprovador atribuído
   *   (direto ou por delegação).
   */
  async pendingForUser(user: AuthenticatedUser) {
    const isAdmin = user.profile === UserProfile.ADMIN;
    const approverIds = isAdmin
      ? null
      : await this.engine.getActingApproverIds(user.id);

    const steps = await this.prisma.approvalStep.findMany({
      where: {
        status: ApprovalStepStatus.PENDING,
        companyId: { in: user.companyIds },
        ...(isAdmin ? {} : { assignedApproverId: { in: approverIds! } }),
      },
      include: {
        requisition: {
          select: {
            id: true,
            number: true,
            title: true,
            totalAmount: true,
            requester: { select: { name: true } },
            quotationWaiverReason: true,
            quotationWaiverNote: true,
          },
        },
        assignedApprover: { select: { id: true, name: true } },
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
    // ao nível. Admin pode fazer override de qualquer step (precisa
    // destravar fluxos quando o aprovador titular está fora). O override
    // exige justificativa e fica registrado em audit + nas observações
    // da decisão.
    const isAdmin = user.profile === UserProfile.ADMIN;
    const allowed = await this.engine.userCanDecideStep(user.id, step);
    const isAdminOverride = isAdmin && !allowed;
    if (!allowed && !isAdmin) {
      throw new ForbiddenException('Você não é o aprovador desta etapa.');
    }
    if (isAdminOverride && (!comments || comments.trim().length < 10)) {
      throw new BadRequestException(
        'Decisões fora da sua alçada exigem uma justificativa de pelo menos 10 caracteres.',
      );
    }

    // Auto-aprovação: por padrão o solicitante não aprova o próprio
    // documento. Admin pode (com justificativa) porque pode precisar
    // destravar casos de exceção — fica auditado.
    const requesterId = await this.engine.documentRequester(step);
    if (requesterId && requesterId === user.id) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Você não pode aprovar um documento que você mesmo solicitou.',
        );
      }
      if (!comments || comments.trim().length < 10) {
        throw new BadRequestException(
          'Para aprovar um documento que você mesmo criou, escreva uma justificativa de pelo menos 10 caracteres.',
        );
      }
    }

    // Prefixa o comentário no override de admin pra ficar óbvio na
    // auditoria/UX que não foi o aprovador titular.
    const finalComments = isAdminOverride
      ? `[Decisão por Administrador — ${user.name}] ${(comments ?? '').trim()}`
      : comments ?? null;

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

    const stepDecision = {
      status: approved
        ? ApprovalStepStatus.APPROVED
        : ApprovalStepStatus.REJECTED,
      decidedById: user.id,
      decidedAt: new Date(),
      comments: finalComments,
    };

    if (!approved) {
      // Atomicidade (audit M12): marca o step e rejeita o documento numa
      // única transação. Notificação fica fora (após o commit).
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalStep.update({
          where: { id: stepId },
          data: stepDecision,
        });
        await this.writeEntityFinalStatus(
          tx,
          step,
          false,
          finalComments ?? undefined,
        );
      });
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

    // Aprovação: o próximo nível pendente é uma leitura sobre OUTROS steps
    // (não depende do update deste), então pode ser resolvida antes da tx.
    const next = await this.prisma.approvalStep.findFirst({
      where: {
        ...filter,
        level: { gt: step.level },
        status: ApprovalStepStatus.PENDING,
      },
      orderBy: { level: 'asc' },
    });

    if (next) {
      // Nível intermediário aprovado: marca o step e avança o nível
      // corrente do documento atomicamente (audit M12).
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalStep.update({
          where: { id: stepId },
          data: stepDecision,
        });
        await this.updateEntityCurrentLevel(tx, step, next.level);
      });
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
      return { result: 'PENDING' as const, nextLevel: next.level };
    }

    // Aprovação final: marca o step e aprova o documento atomicamente.
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: stepId },
        data: stepDecision,
      });
      await this.writeEntityFinalStatus(tx, step, true);
    });
    // Efeitos no ERP (cadastro de fornecedor da cotação vencedora /
    // reabertura do PC pra 'aprovado' no Linx) rodam APÓS o commit —
    // best-effort, nunca dentro da transação (chamada de rede). Audit M12.
    await this.runPostApprovalErpEffects(step);
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
    options: { clearQuotationWaiver?: boolean } = {},
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
    // Admin pode devolver uma etapa de outro aprovador (mesmo princípio
    // do decide() — destravar fluxos). Override fica registrado nos
    // comments com prefixo "[Decisão por Administrador]".
    const isAdmin = user.profile === UserProfile.ADMIN;
    const allowed = await this.engine.userCanDecideStep(user.id, step);
    const isOverride = isAdmin && !allowed;
    if (!allowed && !isAdmin) {
      throw new ForbiddenException('Você não é o aprovador desta etapa.');
    }
    const finalComments = isOverride
      ? `[Decisão por Administrador — ${user.name}] ${trimmed}`
      : trimmed;

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
          comments: finalComments,
        },
      });
      // Atualiza o documento — só Requisição e PC suportam revisão
      // (SV não tem ciclo de edição).
      if (step.entityType === ApprovalEntityType.REQUISITION) {
        await tx.requisition.update({
          where: { id: step.requisitionId as string },
          data: {
            status: RequisitionStatus.REVISION,
            revisionReason: finalComments,
            revisionRequestedAt: now,
            revisionRequestedById: user.id,
            currentTierLevel: null,
            // Recusa da dispensa de cotação — limpa os 3 campos pra que
            // o solicitante anexe cotações de verdade ao re-submeter
            // (a regra padrão volta a valer).
            ...(options.clearQuotationWaiver
              ? {
                  quotationWaiverReason: null,
                  quotationWaiverNote: null,
                  quotationWaiverAt: null,
                }
              : {}),
          },
        });
      } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
        await tx.purchaseOrder.update({
          where: { id: step.purchaseOrderId as string },
          data: {
            status: PurchaseOrderStatus.DRAFT,
            lastEditReason: `REVISÃO: ${finalComments}`,
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
        body: `${user.name ?? user.adUsername} pediu ajustes em ${docNum}. Motivo: ${finalComments}`,
        entityType: step.entityType,
        entityId:
          step.requisitionId ?? (step.purchaseOrderId as string),
        sendEmail: true,
      });
    }
    return { result: 'REVISION' as const };
  }

  /** Atualiza o nível de aprovação corrente do documento (dentro de tx). */
  private async updateEntityCurrentLevel(
    tx: Prisma.TransactionClient,
    step: {
      entityType: string;
      requisitionId: string | null;
      purchaseOrderId: string | null;
      fundRequestId: string | null;
    },
    level: number,
  ): Promise<void> {
    if (step.entityType === ApprovalEntityType.REQUISITION) {
      await tx.requisition.update({
        where: { id: step.requisitionId as string },
        data: { currentTierLevel: level },
      });
    } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
      await tx.purchaseOrder.update({
        where: { id: step.purchaseOrderId as string },
        data: { currentTierLevel: level },
      });
    } else {
      await tx.fundRequest.update({
        where: { id: step.fundRequestId as string },
        data: { currentTierLevel: level },
      });
    }
  }

  /**
   * Grava o status final (aprovado/rejeitado) no documento. SOMENTE banco
   * — roda dentro da transação do decide(). Os efeitos no ERP (que fazem
   * chamada de rede) ficam em runPostApprovalErpEffects, após o commit.
   */
  private async writeEntityFinalStatus(
    tx: Prisma.TransactionClient,
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
      await tx.requisition.update({
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
      await tx.purchaseOrder.update({
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
      await tx.fundRequest.update({
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

  /**
   * Efeitos no ERP após aprovação FINAL — rodam DEPOIS do commit, fora de
   * qualquer transação (chamadas de rede ao Linx não podem segurar a tx).
   * Tudo best-effort: falha aqui é logada e NÃO desfaz a aprovação já
   * persistida (admin reprocessa pelos endpoints de reconciliação).
   */
  private async runPostApprovalErpEffects(step: {
    entityType: string;
    requisitionId: string | null;
    purchaseOrderId: string | null;
    decidedById?: string | null;
    assignedApproverId?: string | null;
  }): Promise<void> {
    if (step.entityType === ApprovalEntityType.REQUISITION) {
      // Cotação vencedora com fornecedor não cadastrado no ERP → cadastro
      // automático (logado em integration_logs; reprocessável via
      // /admin/suppliers/from-quotation/:id).
      try {
        const winners = await this.prisma.quotation.findMany({
          where: {
            requisitionId: step.requisitionId as string,
            isWinner: true,
            supplierErpCode: null,
          },
          select: { id: true },
        });
        for (const q of winners) {
          try {
            await this.linx.criarFornecedorDeQuotation(q.id);
          } catch (e) {
            this.logger.warn(
              `Falha ao criar fornecedor da cotação ${q.id}: ${(e as Error).message}`,
            );
          }
        }
      } catch (e) {
        this.logger.warn(
          `Falha ao buscar cotações vencedoras: ${(e as Error).message}`,
        );
      }
    } else if (step.entityType === ApprovalEntityType.PURCHASE_ORDER) {
      // Reaprovação após edição: o PC tinha sido marcado 'em estudo' no
      // Linx; reabrimos pra 'aprovado'. Idempotente.
      const deciderId =
        step.decidedById ?? step.assignedApproverId ?? undefined;
      if (!deciderId) {
        this.logger.warn(
          'Step sem decisor identificado — pulei a reabertura no ERP (aprovação já persistida).',
        );
        return;
      }
      try {
        const decider = await this.prisma.user.findUniqueOrThrow({
          where: { id: deciderId },
        });
        const po = await this.prisma.purchaseOrder.findUniqueOrThrow({
          where: { id: step.purchaseOrderId as string },
          select: { id: true, companyId: true, erpPedido: true, number: true },
        });
        await this.linx.markPedidoAprovado(po, {
          id: decider.id,
          name: decider.name,
          adUsername: decider.adUsername,
        } as AuthenticatedUser);
      } catch (err) {
        this.logger.warn(
          `PC ${step.purchaseOrderId}: falha ao reabrir Linx pra 'A' após aprovação: ${(err as Error).message}`,
        );
      }
    }
  }
}
