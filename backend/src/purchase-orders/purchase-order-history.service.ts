import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

/** Linha cronológica do PC apresentada na timeline da UI. */
export interface PurchaseOrderTimelineEvent {
  at: string;
  kind: string;
  label: string;
  who?: string | null;
  detail?: string | null;
}

/**
 * Timeline do Pedido de Compra: agrupa marcos próprios do PC (criação,
 * aprovação, envio, integração, edição, cancelamento) com eventos
 * relacionados (recebimentos confirmados, decisões da cadeia).
 *
 * Mantido fora do `PurchaseOrdersService` por ser leitura pura — não
 * altera o PC. O componente `HistoryTimeline` do frontend consome o
 * resultado direto.
 */
@Injectable()
export class PurchaseOrderHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Eventos da timeline em ordem decrescente (mais recente primeiro). */
  async getEvents(
    user: AuthenticatedUser,
    purchaseOrderId: string,
  ): Promise<PurchaseOrderTimelineEvent[]> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { buyer: { select: { id: true, name: true } } },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    if (!user.companyIds.includes(po.companyId)) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }

    const events: PurchaseOrderTimelineEvent[] = [];

    events.push({
      at: po.createdAt.toISOString(),
      kind: 'created',
      label: 'Pedido criado a partir da requisição',
      who: po.buyer?.name ?? null,
    });

    if (po.approvedAt) {
      events.push({
        at: po.approvedAt.toISOString(),
        kind: 'approved',
        label: 'Pedido aprovado',
      });
    }
    if (po.sentToSupplierAt) {
      events.push({
        at: po.sentToSupplierAt.toISOString(),
        kind: 'sent',
        label: 'Enviado ao fornecedor',
      });
    }
    if (po.integratedAt) {
      events.push({
        at: po.integratedAt.toISOString(),
        kind: 'integrated',
        label: `Integrado ao ERP (${po.erpPedido ?? 'sem número'})`,
      });
    }
    if (po.lastEditedAt) {
      const editor = po.lastEditedById
        ? await this.prisma.user.findUnique({
            where: { id: po.lastEditedById },
            select: { name: true },
          })
        : null;
      events.push({
        at: po.lastEditedAt.toISOString(),
        kind: 'edited',
        label: 'Pedido editado',
        who: editor?.name ?? null,
        detail: po.lastEditReason,
      });
    }
    if (po.cancelledAt) {
      events.push({
        at: po.cancelledAt.toISOString(),
        kind: 'cancelled',
        label: 'Pedido cancelado',
        detail: po.cancellationReason,
      });
    }

    // Recebimentos confirmados (já têm o número e quem recebeu).
    const receivings = await this.prisma.receiving.findMany({
      where: { purchaseOrderId, status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
      include: { receivedBy: { select: { name: true } } },
    });
    for (const r of receivings) {
      if (!r.confirmedAt) continue;
      events.push({
        at: r.confirmedAt.toISOString(),
        kind: 'received',
        label: `Recebimento ${r.number} confirmado`,
        who: r.receivedBy?.name ?? null,
      });
    }

    // Decisões dos níveis da cadeia de aprovação.
    const steps = await this.prisma.approvalStep.findMany({
      where: { purchaseOrderId, status: { not: 'PENDING' } },
      orderBy: { decidedAt: 'desc' },
      include: { decidedBy: { select: { name: true } } },
    });
    for (const s of steps) {
      if (!s.decidedAt) continue;
      events.push({
        at: s.decidedAt.toISOString(),
        kind:
          s.status === 'REVISION'
            ? 'revision'
            : `step-${s.status.toLowerCase()}`,
        label:
          s.status === 'REVISION'
            ? `${s.levelName}: devolveu para revisão`
            : `${s.levelName}: ${
                s.status === 'APPROVED' ? 'aprovou' : 'reprovou'
              }`,
        who: s.decidedBy?.name ?? null,
        detail: s.comments,
      });
    }

    return events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }
}
