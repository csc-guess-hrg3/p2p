import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalStepStatus } from '../common/enums';

/**
 * Step parcial usado pelos métodos do engine. Reflete a forma do
 * `ApprovalStep` do Prisma, recortado para os campos relevantes pra
 * resolução de aprovador / filial / documento.
 */
export interface StepRef {
  requisitionId: string | null;
  purchaseOrderId: string | null;
  fundRequestId: string | null;
}

export interface DecisionContext extends StepRef {
  assignedApproverId: string | null;
  teamApprovalLevelId: string | null;
  companyId: string;
}

/**
 * Motor de resolução da cadeia de aprovação — **leitura pura**.
 *
 * Responsabilidade única: dado um step, dizer se um usuário pode decidi-lo
 * e fornecer metadados do documento associado (solicitante, número,
 * filial). Sem efeitos colaterais — não notifica, não muta estado, não
 * fala com o ERP. Mantido fora do `ApprovalsService` para evitar que o
 * fluxo de orquestração misture com regras puras (mais fácil de testar
 * e de reutilizar em outros pontos como pendingForUser/mineWaiting).
 */
@Injectable()
export class ApprovalEngineService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtro Prisma para os steps do mesmo documento que o step base. */
  entityFilter(step: StepRef): Prisma.ApprovalStepWhereInput {
    if (step.requisitionId) return { requisitionId: step.requisitionId };
    if (step.purchaseOrderId) return { purchaseOrderId: step.purchaseOrderId };
    return { fundRequestId: step.fundRequestId };
  }

  /**
   * IDs sob os quais o usuário pode aprovar: ele mesmo + os delegantes
   * que estão com delegação ativa para ele neste momento.
   */
  async getActingApproverIds(userId: string): Promise<string[]> {
    const now = new Date();
    const delegations = await this.prisma.delegation.findMany({
      where: {
        delegateId: userId,
        active: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: { delegatorId: true },
    });
    return [userId, ...delegations.map((d) => d.delegatorId)];
  }

  /**
   * Checa se o usuário pode decidir o step. Suporta três modos:
   *  1. Step com `assignedApproverId` fixo → user precisa ser ele
   *     (ou delegado dele).
   *  2. Step sem `assignedApproverId` mas com
   *     `TeamApprovalLevel.requiredPositionId` → user precisa ter
   *     aquele cargo (Position).
   *  3. Step + level com `scopeByBranch=true` → além do cargo, user
   *     precisa estar atribuído à filial da requisição
   *     (`user_branch_assignments`).
   */
  async userCanDecideStep(
    userId: string,
    step: DecisionContext,
  ): Promise<boolean> {
    // Modo 1 — aprovador fixo + delegação
    if (step.assignedApproverId) {
      const ids = await this.getActingApproverIds(userId);
      return ids.includes(step.assignedApproverId);
    }
    // Modos 2 e 3 — aprovador dinâmico via cargo (+ filial opcional)
    if (!step.teamApprovalLevelId) return false;
    const level = await this.prisma.teamApprovalLevel.findUnique({
      where: { id: step.teamApprovalLevelId },
      select: { requiredPositionId: true, scopeByBranch: true },
    });
    if (!level?.requiredPositionId) return false;

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { positionId: true },
    });
    if (me?.positionId !== level.requiredPositionId) return false;

    if (!level.scopeByBranch) return true;
    const branchCode = await this.resolveBranchCode(step);
    if (!branchCode) return false;
    const assignment = await this.prisma.userBranchAssignment.findUnique({
      where: {
        userId_companyId_branchErpCode: {
          userId,
          companyId: step.companyId,
          branchErpCode: branchCode,
        },
      },
    });
    return !!assignment;
  }

  /**
   * Lista os candidatos que poderiam decidir um step com aprovador
   * dinâmico. Usado para notificar quando o step é criado sem assignment
   * (caso a Fase 1.5 — hoje só lemos no decide).
   */
  async candidateApprovers(step: DecisionContext): Promise<string[]> {
    if (step.assignedApproverId) return [step.assignedApproverId];
    if (!step.teamApprovalLevelId) return [];
    const level = await this.prisma.teamApprovalLevel.findUnique({
      where: { id: step.teamApprovalLevelId },
      select: { requiredPositionId: true, scopeByBranch: true },
    });
    if (!level?.requiredPositionId) return [];
    const where: Prisma.UserWhereInput = {
      positionId: level.requiredPositionId,
      status: 'ACTIVE',
      deletedAt: null,
    };
    if (level.scopeByBranch) {
      const branchCode = await this.resolveBranchCode(step);
      if (!branchCode) return [];
      where.branchAssignments = {
        some: { companyId: step.companyId, branchErpCode: branchCode },
      };
    }
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** Filial do documento associado ao step (req/po/sv → branchErpCode). */
  async resolveBranchCode(step: StepRef): Promise<string | null> {
    if (step.requisitionId) {
      const r = await this.prisma.requisition.findUnique({
        where: { id: step.requisitionId },
        select: { branchErpCode: true },
      });
      return r?.branchErpCode ?? null;
    }
    if (step.purchaseOrderId) {
      const p = await this.prisma.purchaseOrder.findUnique({
        where: { id: step.purchaseOrderId },
        select: { branchErpCode: true },
      });
      return p?.branchErpCode ?? null;
    }
    if (step.fundRequestId) {
      const sv = await this.prisma.fundRequest.findUnique({
        where: { id: step.fundRequestId },
        select: {
          purchaseOrder: { select: { branchErpCode: true } },
          requisition: { select: { branchErpCode: true } },
        },
      });
      return (
        sv?.purchaseOrder?.branchErpCode ??
        sv?.requisition?.branchErpCode ??
        null
      );
    }
    return null;
  }

  /** Solicitante/comprador do documento (para RN-ALC-03). */
  async documentRequester(step: StepRef): Promise<string | null> {
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

  /** Número do documento (para mensagens de notificação). */
  async documentNumber(step: StepRef): Promise<string> {
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

  /**
   * Filtra uma lista de steps pendentes mantendo só os que estão no
   * nível ativo do documento (sem nível anterior pendente). Útil pra
   * `pendingForUser` não mostrar steps de níveis 2+ enquanto o 1 ainda
   * não decidiu.
   */
  async filterActiveSteps<T extends StepRef & { level: number }>(
    steps: T[],
  ): Promise<T[]> {
    const active: T[] = [];
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
}
