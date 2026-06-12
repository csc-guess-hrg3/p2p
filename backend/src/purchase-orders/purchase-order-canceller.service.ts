import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinxErpService } from '../integration/linx-erp.service';
import {
  IntegrationLogStatus,
  PurchaseOrderStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { assertPoTeamAccess } from './po-access';

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
 * Propaga o cancelamento ao Linx (H-2) — best-effort: cancela no P2P e,
 * se o ERP falhar, registra em integration_log pra reconciliação manual,
 * sem bloquear o cancelamento. Total → header STATUS_COMPRA='C'; parcial →
 * QTDE_CANCEL_PEDIDO por linha.
 */
@Injectable()
export class PurchaseOrderCancellerService {
  private readonly logger = new Logger(PurchaseOrderCancellerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
  ) {}

  /**
   * Best-effort: roda o back-write no Linx e, se falhar, registra um
   * integration_log pra reconciliação manual (o pedido pode ter ficado
   * ativo no ERP). NUNCA relança — o cancelamento no P2P já está feito.
   */
  private async propagarCancelamento(
    po: {
      id: string;
      companyId: string;
      erpPedido: string | null;
      number: string;
    },
    write: () => Promise<void>,
  ): Promise<void> {
    if (!po.erpPedido) return;
    try {
      await write();
    } catch (err) {
      this.logger.error(
        `PC ${po.number}: falha ao propagar cancelamento ao Linx ` +
          `(erpPedido=${po.erpPedido}) — pedido pode seguir ativo no ERP: ${(err as Error).message}`,
      );
      try {
        const company = await this.prisma.company.findUnique({
          where: { id: po.companyId },
          select: { code: true },
        });
        await this.prisma.integrationLog.create({
          data: {
            companyId: po.companyId,
            source: company?.code === 'HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
            jobType: 'CANCEL_PO',
            status: IntegrationLogStatus.FAILED,
            recordsProcessed: 0,
            errorDetails:
              `Cancelamento do PC ${po.number} (erpPedido ${po.erpPedido}) não ` +
              `propagado ao Linx — requer cancelamento manual no ERP: ${(err as Error).message}`,
          },
        });
      } catch {
        // logging do log falhou — já registramos o erro principal acima.
      }
    }
  }

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
        'Este pedido já tem itens recebidos. Use "Cancelar itens em aberto" ' +
          'para cancelar somente o saldo que ainda não chegou.',
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

    // Propaga ao Linx (H-2): header → cancelado + zera o saldo das linhas
    // (nada recebido neste caminho). Best-effort — não bloqueia o P2P.
    await this.propagarCancelamento(po, async () => {
      await this.linx.markPedidoCancelado(po, cancellationReason, user);
      await this.linx.cancelarSaldoItens(po, this.toCancelLines(po.items));
    });

    return this.loadPO(user, id);
  }

  /** Monta as linhas de cancelamento (saldo em aberto) pro back-write Linx. */
  private toCancelLines(
    items: Array<{
      itemErpCode: string | null;
      itemDescription: string;
      quantity: { toString(): string };
      receivedQty: { toString(): string };
      unitPrice: { toString(): string };
    }>,
  ): Array<{ consumivel: string; qtdeCancel: number; valorCancel: number }> {
    return items.map((it) => {
      const saldo = Number(it.quantity) - Number(it.receivedQty);
      return {
        consumivel: it.itemErpCode ?? it.itemDescription,
        qtdeCancel: saldo,
        valorCancel: Number((saldo * Number(it.unitPrice)).toFixed(2)),
      };
    });
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

    const finalPo = await this.loadPO(user, id);
    // Propaga ao Linx (H-2): cancela o saldo das linhas dos itens informados;
    // se o cancelamento parcial fechou o pedido inteiro, marca o header como
    // cancelado também. Best-effort — não bloqueia o P2P.
    await this.propagarCancelamento(finalPo, async () => {
      await this.linx.cancelarSaldoItens(finalPo, this.toCancelLines(targets));
      if (finalPo.status === PurchaseOrderStatus.CANCELLED) {
        await this.linx.markPedidoCancelado(finalPo, reason, user);
      }
    });

    this.logger.log(
      `PC ${po.number}: ${targets.length} itens cancelados por ${user.name} — ${reason}`,
    );
    return finalPo;
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
        requisition: { select: { teamId: true } },
      },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    assertPoTeamAccess(user, po);
    return po;
  }
}
