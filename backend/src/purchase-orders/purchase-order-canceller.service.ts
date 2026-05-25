import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderStatus, UserProfile } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Cancelamento de Pedido de Compra — total e parcial (RN-OC-03).
 *
 * - **Total**: `cancel()` marca o PC como CANCELLED e cada item com
 *   `cancelledQty = quantity - receivedQty`. Bloqueado se já houver
 *   recebimento (caminho correto é o parcial).
 * - **Parcial**: `cancelItems()` cancela o saldo dos itens informados;
 *   se todos os itens ficarem fechados (recebidos ou cancelados), o PC
 *   inteiro vai pra CANCELLED.
 *
 * Não toca no Linx ainda (item "STATUS_COMPRA back-write" — Rodada 4).
 */
@Injectable()
export class PurchaseOrderCancellerService {
  private readonly logger = new Logger(PurchaseOrderCancellerService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Cancelamento total — bloqueado se houver recebimento. */
  async cancel(
    user: AuthenticatedUser,
    id: string,
    cancellationReason: string,
  ) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cancela pedido de compra.');
    }
    const po = await this.loadPO(user, id);
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Pedido já está cancelado.');
    }
    if (po.status === PurchaseOrderStatus.FULLY_RECEIVED) {
      throw new BadRequestException(
        'Pedido totalmente recebido — não pode ser cancelado, apenas estornado.',
      );
    }
    const anyReceived = po.items.some((it) => Number(it.receivedQty) > 0);
    if (anyReceived) {
      throw new BadRequestException(
        'Pedido já tem recebimento. Use "Cancelar itens em aberto" pra ' +
          'cancelar só o saldo não recebido (PRD RN-OC-03).',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason,
        },
      });
      // Marca cada item com cancelamento total — útil pra histórico.
      await tx.purchaseOrderItem.updateMany({
        where: { purchaseOrderId: id, cancelledAt: null },
        data: { cancelledAt: now, cancellationReason },
      });
      // Atualiza cancelledQty = quantity - receivedQty (sem updateMany
      // por depender de outra coluna).
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
        select: { id: true, quantity: true, receivedQty: true },
      });
      for (const it of items) {
        await tx.purchaseOrderItem.update({
          where: { id: it.id },
          data: {
            cancelledQty: Number(it.quantity) - Number(it.receivedQty),
          },
        });
      }
    });
    return this.loadPO(user, id);
  }

  /** Cancelamento parcial — cancela só o saldo dos itens informados. */
  async cancelItems(
    user: AuthenticatedUser,
    id: string,
    payload: { itemIds: string[]; reason: string },
  ) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cancela itens de pedido.');
    }
    const reason = (payload.reason ?? '').trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Motivo do cancelamento obrigatório (mínimo 5 caracteres).',
      );
    }
    if (!payload.itemIds || payload.itemIds.length === 0) {
      throw new BadRequestException(
        'Informe pelo menos um item para cancelar.',
      );
    }

    const po = await this.loadPO(user, id);
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Pedido já está cancelado.');
    }

    const idSet = new Set(payload.itemIds);
    const targets = po.items.filter((it) => idSet.has(it.id));
    if (targets.length !== payload.itemIds.length) {
      throw new BadRequestException(
        'Algum item informado não pertence ao pedido.',
      );
    }
    for (const it of targets) {
      if (it.cancelledAt) {
        throw new BadRequestException(
          `Item ${it.itemDescription} já está cancelado.`,
        );
      }
      const saldo = Number(it.quantity) - Number(it.receivedQty);
      if (saldo <= 0) {
        throw new BadRequestException(
          `Item ${it.itemDescription} já foi totalmente recebido — não pode ser cancelado.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const it of targets) {
        const saldo = Number(it.quantity) - Number(it.receivedQty);
        await tx.purchaseOrderItem.update({
          where: { id: it.id },
          data: {
            cancelledQty: saldo,
            cancelledAt: now,
            cancellationReason: reason,
          },
        });
      }
      // Se todos os itens estão fechados → cancela o pedido inteiro.
      const stillOpen = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id, cancelledAt: null },
        select: { quantity: true, receivedQty: true },
      });
      const anyOpen = stillOpen.some(
        (i) => Number(i.quantity) - Number(i.receivedQty) > 0,
      );
      if (stillOpen.length === 0 || !anyOpen) {
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: PurchaseOrderStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: reason,
          },
        });
      }
    });
    this.logger.log(
      `PC ${po.number}: ${targets.length} itens cancelados por ${user.name} — ${reason}`,
    );
    return this.loadPO(user, id);
  }

  /**
   * Carrega o PC com a estrutura mínima necessária para as validações
   * de cancelamento e para a resposta do endpoint. Mantém o canceller
   * autocontido — não depende do `findOne` do PurchaseOrdersService.
   */
  private async loadPO(user: AuthenticatedUser, id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { rateios: true } },
        buyer: { select: { id: true, name: true } },
        receivings: true,
      },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    if (!user.companyIds.includes(po.companyId)) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }
    return po;
  }
}
