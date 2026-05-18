import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import { CreateReceivingDto } from './dto/create-receiving.dto';
import { QueryReceivingsDto } from './dto/query-receivings.dto';

// Status do PC que ainda admitem recebimento.
const RECEIVABLE_PO_STATUS: string[] = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.SENT_TO_SUPPLIER,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class ReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
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
      const remaining =
        Number(poItem.quantity) - Number(poItem.receivedQty);
      if (line.acceptedQty - remaining > 1e-6) {
        throw new BadRequestException(
          `Item ${poItem.itemDescription}: quantidade aceita (${line.acceptedQty}) ` +
            `excede o saldo do pedido (${remaining}).`,
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
    const { companyId, purchaseOrderId, status, search, skip = 0, take = 50 } =
      query;
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
   * Confirma um recebimento em rascunho:
   * acumula a quantidade aceita no saldo dos itens do PC e atualiza o
   * status do PC (parcial/total). Recebimento com rejeição vira DIVERGENTE.
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

    const hasRejection = receiving.items.some(
      (it) => Number(it.rejectedQty) > 0,
    );
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
            status: hasRejection
              ? ReceivingStatus.DIVERGENT
              : ReceivingStatus.CONFIRMED,
            confirmedAt: now,
          },
        });
      },
      { maxWait: 15000, timeout: 30000 },
    );

    return this.findOne(user, id);
  }
}
