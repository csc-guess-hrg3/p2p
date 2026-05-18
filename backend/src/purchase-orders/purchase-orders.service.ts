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
  RequisitionNfType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { ConvertToPurchaseOrderDto } from './dto/convert-to-po.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';

interface SnapshotLine {
  kind: string;
  rateioCode: string;
  targetCode: string;
  branchCode: string | null;
  percentage: Prisma.Decimal;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  /**
   * Recalcula os valores das linhas de rateio para um novo total
   * (o preço negociado pode diferir do estimado da requisição).
   * Mantém os percentuais; a última linha de cada tipo absorve o resíduo.
   */
  private recomputeRateios(lines: SnapshotLine[], total: number) {
    const out: {
      kind: string;
      rateioCode: string;
      targetCode: string;
      branchCode: string | null;
      percentage: number;
      amount: number;
    }[] = [];
    for (const kind of ['BRANCH', 'COST_CENTER']) {
      const group = lines.filter((l) => l.kind === kind);
      let allocated = 0;
      group.forEach((l, i) => {
        const pct = Number(l.percentage);
        const isLast = i === group.length - 1;
        const amount = isLast
          ? Number((total - allocated).toFixed(2))
          : Number(((total * pct) / 100).toFixed(2));
        allocated += amount;
        out.push({
          kind: l.kind,
          rateioCode: l.rateioCode,
          targetCode: l.targetCode,
          branchCode: l.branchCode,
          percentage: pct,
          amount,
        });
      });
    }
    return out;
  }

  /** Converte uma requisição aprovada em Pedido de Compra. */
  async convert(user: AuthenticatedUser, dto: ConvertToPurchaseOrderDto) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cria pedidos de compra.');
    }

    const req = await this.prisma.requisition.findUnique({
      where: { id: dto.requisitionId },
      include: { items: { include: { rateios: true } } },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
    if (req.status !== RequisitionStatus.APPROVED) {
      throw new BadRequestException(
        'Só requisições aprovadas podem virar pedido de compra.',
      );
    }
    if (req.tipoNotaFiscal === RequisitionNfType.SEM_NF) {
      throw new BadRequestException(
        'Requisição sem nota fiscal não gera pedido de compra — gera Solicitação de Verba.',
      );
    }
    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { requisitionId: req.id, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Esta requisição já foi convertida em pedido de compra.',
      );
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: req.companyId },
    });
    const priceOverride = new Map(
      (dto.items ?? []).map((i) => [i.requisitionItemId, i.unitPrice]),
    );

    // Monta os itens do pedido a partir dos itens da requisição.
    let totalAmount = 0;
    const poItems = req.items.map((it) => {
      const unitPrice = priceOverride.get(it.id) ?? Number(it.estimatedPrice);
      const totalPrice = Number((Number(it.quantity) * unitPrice).toFixed(2));
      totalAmount += totalPrice;
      return {
        requisitionItemId: it.id,
        itemErpCode: it.itemErpCode,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice,
        totalPrice,
        accountingAccount: it.accountingAccount,
        accountName: it.accountName,
        branchRateioCode: it.branchRateioCode,
        branchRateioDesc: it.branchRateioDesc,
        costCenterRateioCode: it.costCenterRateioCode,
        costCenterRateioDesc: it.costCenterRateioDesc,
        notes: it.notes,
        rateios: {
          create: this.recomputeRateios(it.rateios, totalPrice),
        },
      };
    });

    const number = await this.numbering.next(company.code, 'OC');
    const now = new Date();

    const [po] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.create({
        data: {
          number,
          requisitionId: req.id,
          companyId: req.companyId,
          branchErpCode: req.branchErpCode,
          branchName: req.branchName,
          supplierErpCode: req.supplierErpCode,
          supplierName: req.supplierName,
          buyerId: user.id,
          // PC nasce aprovado — a aprovação da requisição já basta (Opção A).
          status: PurchaseOrderStatus.APPROVED,
          approvedAt: now,
          paymentCondition: dto.paymentCondition ?? null,
          deliveryAddress: dto.deliveryAddress ?? null,
          expectedDelivery: dto.expectedDelivery
            ? new Date(dto.expectedDelivery)
            : null,
          totalAmount: Number(totalAmount.toFixed(2)),
          items: { create: poItems },
        },
        include: { items: { include: { rateios: true } } },
      }),
      this.prisma.requisition.update({
        where: { id: req.id },
        data: { status: RequisitionStatus.CONVERTED },
      }),
    ]);
    return po;
  }

  /** Lista pedidos de compra do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryPurchaseOrdersDto) {
    const { companyId, status, search, skip = 0, take = 50 } = query;
    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(search ? { number: { contains: search } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { buyer: { select: { id: true, name: true } } },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Detalhe de um pedido de compra. */
  async findOne(user: AuthenticatedUser, id: string) {
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

  /** Marca o pedido como enviado ao fornecedor. */
  async sendToSupplier(user: AuthenticatedUser, id: string) {
    const po = await this.findOne(user, id);
    if (po.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'Só pedidos aprovados podem ser enviados ao fornecedor.',
      );
    }
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT_TO_SUPPLIER,
        sentToSupplierAt: new Date(),
      },
    });
    return this.findOne(user, id);
  }
}
