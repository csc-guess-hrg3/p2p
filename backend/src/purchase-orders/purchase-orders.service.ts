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
import { assertPoTeamAccess } from './po-access';

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
    const isAdmin = user.profile === UserProfile.ADMIN;
    // Padrão 'mine' (a tela abre nos pedidos do próprio comprador). 'all' só
    // admin. PO não tem teamId — o escopo de equipe vai pela requisição.
    const scope = query.scope ?? 'mine';
    if (scope === 'all' && !isAdmin) {
      throw new ForbiddenException(
        'Apenas administradores podem ver todos os pedidos.',
      );
    }
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      // Visibilidade base: não-admin só a própria equipe (via requisição).
      ...(isAdmin ? {} : { requisition: { teamId: user.teamId } }),
      // Escopo escolhido.
      ...(scope === 'mine' ? { buyerId: user.id } : {}),
      ...(scope === 'team' ? { requisition: { teamId: user.teamId } } : {}),
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
        requisition: { select: { teamId: true } },
      },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    assertPoTeamAccess(user, po);
    return po;
  }

  // Métodos sendToSupplier/resendToSupplier foram REMOVIDOS — para
  // consumíveis a gravação no Linx é automática no convert() (sem
  // etapa de e-mail). EmailService e o status SENT_TO_SUPPLIER seguem
  // no schema, reservados para o módulo de Produto Acabado (PA) futuro,
  // que terá seu próprio fluxo de envio ao fornecedor.

  // cancel() vive em PurchaseOrderCancellerService.
  // history() vive em PurchaseOrderHistoryService.
  // edit() vive em PurchaseOrderEditorService.
}
