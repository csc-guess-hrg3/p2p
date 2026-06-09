import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import {
  PurchaseOrderStatus,
  ReceivingStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReceivingDto } from './dto/create-receiving.dto';
import { QueryReceivingsDto } from './dto/query-receivings.dto';

// Status do PC que ainda admitem recebimento. INTEGRATED é o novo estado
// "oficializado no Linx" — substitui o SENT_TO_SUPPLIER do antigo fluxo
// de envio por e-mail (consumível não envia mais e-mail; a gravação no
// ERP acontece automaticamente na conversão).
const RECEIVABLE_PO_STATUS: string[] = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.SENT_TO_SUPPLIER,
  PurchaseOrderStatus.INTEGRATED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class ReceivingService {
  private readonly logger = new Logger(ReceivingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Registra um recebimento (em rascunho) contra um Pedido de Compra. */
  async create(user: AuthenticatedUser, dto: CreateReceivingDto) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não registra recebimentos.');
    }

    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true, company: true },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    if (!user.companyIds.includes(po.companyId)) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }
    if (!RECEIVABLE_PO_STATUS.includes(po.status)) {
      throw new BadRequestException(
        'O pedido de compra não está em um estado que admita recebimento.',
      );
    }

    const poItemById = new Map(po.items.map((it) => [it.id, it]));

    // Valida cada linha do recebimento contra o item do pedido.
    // Receber acima do saldo é permitido — a divergência é avaliada na
    // confirmação, conforme a tolerância da empresa.
    const items = dto.items.map((line) => {
      const poItem = poItemById.get(line.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(
          `Item ${line.purchaseOrderItemId} não pertence a este pedido.`,
        );
      }
      const rejectedQty = line.rejectedQty ?? 0;
      const sum = Number((line.acceptedQty + rejectedQty).toFixed(4));
      if (sum !== Number(line.receivedQty.toFixed(4))) {
        throw new BadRequestException(
          `Item ${poItem.itemDescription}: aceito + rejeitado deve ser igual ao recebido.`,
        );
      }
      return {
        purchaseOrderItemId: poItem.id,
        receivedQty: line.receivedQty,
        acceptedQty: line.acceptedQty,
        rejectedQty,
        rejectionReason: line.rejectionReason ?? null,
      };
    });

    const number = await this.numbering.next(po.company.code, 'REC');

    const receiving = await this.prisma.receiving.create({
      data: {
        number,
        purchaseOrderId: po.id,
        companyId: po.companyId,
        receivedById: user.id,
        status: ReceivingStatus.DRAFT,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        measurementStart: dto.measurementStart
          ? new Date(dto.measurementStart)
          : null,
        measurementEnd: dto.measurementEnd
          ? new Date(dto.measurementEnd)
          : null,
        completionPct: dto.completionPct ?? null,
        notes: dto.notes ?? null,
        items: { create: items },
      },
      include: { items: true },
    });
    return receiving;
  }

  /** Lista recebimentos do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryReceivingsDto) {
    const {
      companyId,
      purchaseOrderId,
      status,
      search,
      skip = 0,
      take = 50,
    } = query;
    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const where: Prisma.ReceivingWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
      ...(status ? { status } : {}),
      ...(search ? { number: { contains: search } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.receiving.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          receivedBy: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
        },
      }),
      this.prisma.receiving.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Detalhe de um recebimento. */
  async findOne(user: AuthenticatedUser, id: string) {
    const receiving = await this.prisma.receiving.findUnique({
      where: { id },
      include: {
        items: true,
        receivedBy: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true, status: true } },
      },
    });
    if (!receiving || receiving.deletedAt) {
      throw new NotFoundException('Recebimento não encontrado.');
    }
    if (!user.companyIds.includes(receiving.companyId)) {
      throw new ForbiddenException('Sem acesso a este recebimento.');
    }
    return receiving;
  }

  /**
   * Confirma um recebimento em rascunho: acumula a quantidade aceita no
   * saldo dos itens do PC e atualiza o status do PC (parcial/total).
   *
   * Marca o recebimento como DIVERGENTE quando, acima da tolerância da
   * empresa (parâmetro `receiving.divergence_tolerance_pct`):
   *  - a proporção de itens rejeitados excede o %, ou
   *  - a quantidade recebida supera a pedida acima do %.
   */
  async confirm(user: AuthenticatedUser, id: string) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não confirma recebimentos.');
    }
    const receiving = await this.findOne(user, id);
    if (receiving.status !== ReceivingStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas recebimentos em rascunho podem ser confirmados.',
      );
    }

    const tolPct = await this.settings.getNumber(
      receiving.companyId,
      'receiving.divergence_tolerance_pct',
    );

    // Proporção rejeitada do recebimento.
    const totalReceived = receiving.items.reduce(
      (s, it) => s + Number(it.receivedQty),
      0,
    );
    const totalRejected = receiving.items.reduce(
      (s, it) => s + Number(it.rejectedQty),
      0,
    );
    const rejectedPct =
      totalReceived > 0 ? (totalRejected / totalReceived) * 100 : 0;
    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        // Acumula a quantidade aceita no saldo de cada item do pedido.
        for (const it of receiving.items) {
          await tx.purchaseOrderItem.update({
            where: { id: it.purchaseOrderItemId },
            data: { receivedQty: { increment: it.acceptedQty } },
          });
        }
        // Recalcula o status do pedido com os saldos atualizados.
        const poItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: receiving.purchaseOrder.id },
          select: { quantity: true, receivedQty: true },
        });
        const fullyReceived = poItems.every(
          (it) => Number(it.receivedQty) - Number(it.quantity) >= -1e-6,
        );
        // Maior excedente (% recebido acima do pedido) entre os itens.
        let overPct = 0;
        for (const it of poItems) {
          const ordered = Number(it.quantity);
          const received = Number(it.receivedQty);
          if (ordered > 0 && received > ordered) {
            overPct = Math.max(overPct, ((received - ordered) / ordered) * 100);
          }
        }

        const notes: string[] = [];
        if (rejectedPct - tolPct > 1e-6) {
          notes.push(
            `Rejeição de ${rejectedPct.toFixed(2)}% (tolerância ${tolPct}%).`,
          );
        }
        if (overPct - tolPct > 1e-6) {
          notes.push(
            `Recebimento ${overPct.toFixed(2)}% acima do pedido ` +
              `(tolerância ${tolPct}%).`,
          );
        }
        const divergent = notes.length > 0;

        await tx.purchaseOrder.update({
          where: { id: receiving.purchaseOrder.id },
          data: {
            status: fullyReceived
              ? PurchaseOrderStatus.FULLY_RECEIVED
              : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          },
        });
        await tx.receiving.update({
          where: { id: receiving.id },
          data: {
            status: divergent
              ? ReceivingStatus.DIVERGENT
              : ReceivingStatus.CONFIRMED,
            confirmedAt: now,
            divergenceNotes: divergent ? notes.join(' ') : null,
          },
        });
      },
      { maxWait: 15000, timeout: 30000 },
    );

    // Notifica o comprador e o solicitante da requisição original.
    // Falhas viram log no NotificationsService — não bloqueiam o confirm.
    try {
      const fresh = await this.prisma.purchaseOrder.findUnique({
        where: { id: receiving.purchaseOrder.id },
        select: {
          id: true,
          companyId: true,
          number: true,
          status: true,
          buyerId: true,
          requisition: { select: { requesterId: true } },
        },
      });
      if (fresh) {
        const fullyReceived =
          fresh.status === PurchaseOrderStatus.FULLY_RECEIVED;
        const title = fullyReceived
          ? `PC ${fresh.number} totalmente recebido`
          : `Recebimento parcial do PC ${fresh.number}`;
        const divergent =
          (await this.prisma.receiving.findUnique({
            where: { id },
            select: { status: true, divergenceNotes: true },
          })) ?? null;
        const body =
          divergent?.status === ReceivingStatus.DIVERGENT
            ? `Recebimento confirmado com divergência: ${divergent.divergenceNotes ?? ''}`
            : 'Recebimento confirmado dentro da tolerância.';
        const recipients = new Set<string>();
        if (fresh.buyerId) recipients.add(fresh.buyerId);
        if (fresh.requisition?.requesterId)
          recipients.add(fresh.requisition.requesterId);
        for (const uid of recipients) {
          await this.notifications.create({
            companyId: fresh.companyId,
            userId: uid,
            type:
              divergent?.status === ReceivingStatus.DIVERGENT
                ? 'RECEIVING_DIVERGENT'
                : 'RECEIVING_CONFIRMED',
            title,
            body,
            entityType: 'PURCHASE_ORDER',
            entityId: fresh.id,
            sendEmail: true,
          });
        }
      }
    } catch (err) {
      // Notificação é best-effort — falha não trava o confirm. Logamos
      // pra que problemas reais (SMTP fora do ar, etc.) sejam visíveis.
      this.logger.warn(
        `Falha ao notificar do recebimento ${id}: ${(err as Error).message}`,
      );
    }

    return this.findOne(user, id);
  }
}
