import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LinxErpService } from '../integration/linx-erp.service';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  ApprovalEntityType,
  PurchaseOrderStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { EditPurchaseOrderDto } from './dto/edit-po.dto';

/**
 * Edição in-place de Pedidos de Compra (PRD RN-OC-01).
 *
 * Regras:
 * - Bloqueia se já houver recebimento confirmado (caminho correto é o
 *   cancelamento parcial dos itens em aberto).
 * - Bloqueia se PC está fechado (CANCELLED ou FULLY_RECEIVED).
 * - Aceita ajustes em paymentCondition, transportadora, endereço,
 *   expectedDelivery e em quantidade/preço unitário dos itens.
 * - Volta o status para DRAFT, marca o Linx como "em estudo" e dispara
 *   nova cadeia de aprovação. Quando reaprovado, o ApprovalsService
 *   volta o Linx para "aprovado" (idem ao fluxo de criação).
 * - Exige motivo (mín. 5 chars) — gravado em `lastEditReason`. Histórico
 *   granular vive em `audit_logs`.
 */
@Injectable()
export class PurchaseOrderEditorService {
  private readonly logger = new Logger(PurchaseOrderEditorService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
    private readonly approvals: ApprovalsService,
  ) {}

  async edit(
    user: AuthenticatedUser,
    id: string,
    dto: EditPurchaseOrderDto,
  ) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não edita pedidos de compra.');
    }
    const reason = dto.reason.trim();

    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (!user.companyIds.includes(po.companyId)) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }
    const closed: string[] = [
      PurchaseOrderStatus.CANCELLED,
      PurchaseOrderStatus.FULLY_RECEIVED,
    ];
    if (closed.includes(po.status)) {
      throw new BadRequestException(
        `Pedido em status "${po.status}" não pode ser editado.`,
      );
    }
    const anyReceived = po.items.some((it) => Number(it.receivedQty) > 0);
    if (anyReceived) {
      throw new BadRequestException(
        'Já há recebimento confirmado — não dá pra editar o pedido. ' +
          'Use cancelamento parcial dos itens em aberto se precisar ajustar.',
      );
    }

    // Aplica mudanças nos itens (se houver) e recalcula total.
    const recomputedTotal = await this.applyItemPatches(id, po.items, dto);

    await this.applyHeaderPatch(id, dto, reason, user.id, recomputedTotal);

    // Linx: volta pra "em estudo" — diretor revê via fluxo de aprovação.
    if (po.erpPedido) {
      try {
        await this.linx.markPedidoEmEstudo(po, reason, user);
      } catch (err) {
        // Não bloqueia edição no P2P se Linx falhar; loga warning.
        this.logger.warn(
          `PC ${po.number}: falha ao voltar Linx pra 'E': ${(err as Error).message}`,
        );
      }
    }

    // Reset + nova cadeia de aprovação. Quando a cadeia for vazia, o
    // documento já fica APPROVED — e devolvemos o Linx pra 'A' aqui.
    await this.approvals.resetForPurchaseOrder(id);
    const next = await this.approvals.startApproval({
      companyId: po.companyId,
      teamId: null, // PC herda equipe da requisição original
      entityType: ApprovalEntityType.PURCHASE_ORDER,
      purchaseOrderId: id,
      amount: recomputedTotal ?? Number(po.totalAmount),
      documentNumber: po.number,
    });
    await this.prisma.purchaseOrder.update({
      where: { id },
      data:
        next === null
          ? { status: PurchaseOrderStatus.APPROVED, approvedAt: new Date() }
          : { status: PurchaseOrderStatus.IN_APPROVAL },
    });
    if (next === null && po.erpPedido) {
      try {
        await this.linx.markPedidoAprovado(po, user);
      } catch (err) {
        this.logger.warn(
          `PC ${po.number}: falha ao reabrir Linx pra 'A': ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `PC ${po.number} editado por ${user.name} (${user.id}): ${reason}`,
    );

    return this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: {
        items: { include: { rateios: true } },
        buyer: { select: { id: true, name: true } },
        receivings: true,
      },
    });
  }

  /**
   * Aplica patches a quantidade/preço por item e devolve o novo total
   * (ou null se nada mudou). A última linha de cada rateio NÃO é
   * recalculada aqui — a edição preserva os rateios snapshot.
   */
  private async applyItemPatches(
    purchaseOrderId: string,
    currentItems: Array<{ id: string; itemDescription: string; quantity: { toString: () => string }; unitPrice: { toString: () => string } }>,
    dto: EditPurchaseOrderDto,
  ): Promise<number | null> {
    if (!dto.items || dto.items.length === 0) return null;

    const itemMap = new Map(currentItems.map((it) => [it.id, it]));
    let total = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const patch of dto.items!) {
        const existing = itemMap.get(patch.id);
        if (!existing) {
          throw new BadRequestException(
            `Item ${patch.id} não pertence ao pedido.`,
          );
        }
        const qty = patch.quantity ?? Number(existing.quantity);
        const unit = patch.unitPrice ?? Number(existing.unitPrice);
        if (qty <= 0) {
          throw new BadRequestException(
            `Quantidade do item ${existing.itemDescription} deve ser > 0.`,
          );
        }
        const totalIt = Number((qty * unit).toFixed(2));
        await tx.purchaseOrderItem.update({
          where: { id: patch.id },
          data: { quantity: qty, unitPrice: unit, totalPrice: totalIt },
        });
      }
      const allItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId },
        select: { totalPrice: true },
      });
      total = allItems.reduce((s, it) => s + Number(it.totalPrice), 0);
    });
    return Number(total.toFixed(2));
  }

  /** Atualiza o header do PC (campos do diálogo + flags de revisão). */
  private async applyHeaderPatch(
    id: string,
    dto: EditPurchaseOrderDto,
    reason: string,
    userId: string,
    recomputedTotal: number | null,
  ): Promise<void> {
    const headerPatch: Record<string, unknown> = {
      status: PurchaseOrderStatus.DRAFT,
      approvedAt: null,
      sentToSupplierAt: null,
      lastEditReason: reason,
      lastEditedAt: new Date(),
      lastEditedById: userId,
    };
    if (dto.paymentCondition !== undefined)
      headerPatch.paymentCondition = dto.paymentCondition || null;
    if (dto.transportadora !== undefined)
      headerPatch.transportadora = dto.transportadora || null;
    if (dto.deliveryAddress !== undefined)
      headerPatch.deliveryAddress = dto.deliveryAddress || null;
    if (dto.expectedDelivery !== undefined) {
      headerPatch.expectedDelivery = dto.expectedDelivery
        ? new Date(dto.expectedDelivery)
        : null;
    }
    if (recomputedTotal !== null) headerPatch.totalAmount = recomputedTotal;

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: headerPatch,
    });
  }
}
