import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LinxErpService } from '../integration/linx-erp.service';
import { EmailService } from '../integration/email.service';
import { IntegrationService } from '../integration/integration.service';
import { PurchaseOrderStatus, UserProfile } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
    private readonly email: EmailService,
    private readonly integration: IntegrationService,
  ) {}
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
    // Select enxuto — evita NVarChar(Max) inúteis (notes, cancellationReason)
    // e cobre o que a UI da listagem usa.
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          supplierName: true,
          branchName: true,
          status: true,
          totalAmount: true,
          expectedDelivery: true,
          erpPedido: true,
          createdAt: true,
          buyer: { select: { id: true, name: true } },
        },
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

  /**
   * Envia o pedido ao fornecedor — fluxo completo:
   *  1) Grava no Linx (COMPRAS + COMPRAS_CONSUMIVEL + STATUS_LOG)
   *     usando LX_SEQUENCIAL para o nº do PEDIDO.
   *  2) Renderiza PDF, envia por e-mail (SMTP da empresa).
   *  3) Loga em COMPRAS_EMAIL_LOG (no Linx).
   *  4) Atualiza o PC: erpPedido, status SENT_TO_SUPPLIER, sentToSupplierAt.
   *
   * O e-mail pode ser pulado com `skipEmail=true` (caso o fornecedor não
   * tenha e-mail cadastrado e o comprador opte por enviar manualmente).
   */
  async sendToSupplier(
    user: AuthenticatedUser,
    id: string,
    opts: {
      recipientEmail?: string;
      skipEmail?: boolean;
      subject?: string;
      bodyText?: string;
    } = {},
  ) {
    const po = await this.findOne(user, id);
    if (po.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'Só pedidos aprovados podem ser enviados ao fornecedor.',
      );
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });

    // 1) Grava no Linx (idempotente se já tiver erpPedido).
    const full = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { items: true },
    });
    const { pedido } = await this.linx.gravarPedidoCompra(full, user);

    // 2) Resolve destinatário e envia o e-mail (a menos que skipEmail).
    let emailSent = false;
    let emailRecipient: string | null = null;
    if (!opts.skipEmail) {
      let to = opts.recipientEmail?.trim() || '';
      if (!to) {
        const sup = await this.integration.findSupplier(
          company.code,
          po.supplierErpCode,
        );
        to = sup?.email?.trim() || '';
      }
      if (!to) {
        throw new BadRequestException(
          'Fornecedor sem e-mail cadastrado. Informe o destinatário ou marque ' +
            '"não notificar" para enviar manualmente.',
        );
      }
      const fullForEmail = await this.prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: po.id },
        include: { items: true },
      });
      await this.email.sendPurchaseOrderEmail(
        { ...fullForEmail, erpPedido: pedido },
        {
          to,
          subject: opts.subject,
          bodyText: opts.bodyText,
        },
      );
      emailSent = true;
      emailRecipient = to;
      // 3) Log no Linx (best-effort).
      await this.linx.logEmail(
        company.erpDbName,
        pedido,
        to,
        user.name ?? user.adUsername ?? '',
        `Envio P2P PC ${po.number}`,
      );
    }

    // 4) Atualiza o PC.
    const now = new Date();
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT_TO_SUPPLIER,
        sentToSupplierAt: now,
        erpPedido: pedido,
        integratedAt: now,
      },
    });

    const updated = await this.findOne(user, id);
    return { ...updated, emailSent, emailRecipient };
  }

  // cancel() vive em PurchaseOrderCancellerService.
  // history() vive em PurchaseOrderHistoryService.
  // edit() vive em PurchaseOrderEditorService.

  /**
   * Reenvia o e-mail do pedido ao fornecedor. Não regrava no ERP — o
   * pedido já está lá (`erpPedido` setado). Útil quando o comprador
   * percebe que o e-mail anterior não chegou ou caiu em spam.
   */
  async resendToSupplier(
    user: AuthenticatedUser,
    id: string,
    opts: {
      recipientEmail?: string;
      subject?: string;
      bodyText?: string;
    } = {},
  ) {
    const po = await this.findOne(user, id);
    if (po.status !== PurchaseOrderStatus.SENT_TO_SUPPLIER &&
        po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED &&
        po.status !== PurchaseOrderStatus.FULLY_RECEIVED) {
      throw new BadRequestException(
        'Só pedidos já enviados podem ser reenviados.',
      );
    }
    if (!po.erpPedido) {
      throw new BadRequestException(
        'Pedido sem referência no ERP — use "Enviar ao Fornecedor" primeiro.',
      );
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });

    let to = opts.recipientEmail?.trim() || '';
    if (!to) {
      const sup = await this.integration.findSupplier(
        company.code,
        po.supplierErpCode,
      );
      to = sup?.email?.trim() || '';
    }
    if (!to) {
      throw new BadRequestException(
        'E-mail do destinatário não informado.',
      );
    }

    const full = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { items: true },
    });
    await this.email.sendPurchaseOrderEmail(full, {
      to,
      subject: opts.subject,
      bodyText: opts.bodyText,
    });
    await this.linx.logEmail(
      company.erpDbName,
      po.erpPedido,
      to,
      user.name ?? user.adUsername ?? '',
      `Reenvio P2P PC ${po.number}`,
    );
    return { ok: true, recipient: to };
  }
}
