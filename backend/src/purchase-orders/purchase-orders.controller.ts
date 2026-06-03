import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderHistoryService } from './purchase-order-history.service';
import { PurchaseOrderConverterService } from './purchase-order-converter.service';
import { PurchaseOrderEditorService } from './purchase-order-editor.service';
import { PurchaseOrderCancellerService } from './purchase-order-canceller.service';
import { ErpBackSyncService } from '../integration/erp-back-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConvertToPurchaseOrderDto } from './dto/convert-to-po.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { CancelPurchaseOrderDto } from './dto/cancel-po.dto';
import { CancelPurchaseOrderItemsDto } from './dto/cancel-po-items.dto';
import { EditPurchaseOrderDto } from './dto/edit-po.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Pedidos de Compra')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  private readonly logger = new Logger(PurchaseOrdersController.name);

  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly historyService: PurchaseOrderHistoryService,
    private readonly converter: PurchaseOrderConverterService,
    private readonly editor: PurchaseOrderEditorService,
    private readonly canceller: PurchaseOrderCancellerService,
    private readonly erpBackSync: ErpBackSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Converte uma requisição aprovada em Pedido de Compra',
  })
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConvertToPurchaseOrderDto,
  ) {
    return this.converter.convert(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista pedidos de compra do escopo do usuário' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPurchaseOrdersDto,
  ) {
    return this.purchaseOrders.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do pedido de compra' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.purchaseOrders.findOne(user, id);
  }

  @Get(':id/erp-status')
  @ApiOperation({
    summary:
      'Consulta read-through do estado atual do PC no Linx — QTDE_ENTREGUE, ' +
      'QTDE_CANCEL_PEDIDO, VALOR_ENTREGUE e status do cabeçalho. NÃO ' +
      'atualiza o P2P (isso é responsabilidade do cron BACK_SYNC); só ' +
      'mostra o estado real do ERP em tempo real.',
  })
  async erpStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const po = await this.purchaseOrders.findOne(user, id);
    if (!po.erpPedido) {
      throw new NotFoundException(
        'PC sem número no Linx — ainda não foi integrado.',
      );
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });
    return this.erpBackSync.readErpStatusByPedido(
      company.erpDbName,
      po.erpPedido,
    );
  }

  @Post('admin/erp-back-sync')
  @ApiOperation({
    summary:
      'Dispara manualmente o cron de back-sync (mão de volta do Linx → P2P). ' +
      'Útil pra testar/forçar atualização sem esperar o cron de 30min. Admin only.',
  })
  async triggerBackSync(@CurrentUser() user: AuthenticatedUser) {
    if (user.profile !== 'ADMIN') {
      throw new ForbiddenException('Só Admin pode disparar o back-sync.');
    }
    // Não awaita — devolve imediatamente e roda async. O .catch evita
    // unhandled rejection se o back-sync falhar (audit B12).
    void this.erpBackSync.syncAll().catch((err) => {
      this.logger.error(
        `Falha no back-sync disparado manualmente: ${(err as Error)?.message ?? err}`,
      );
    });
    return { ok: true, message: 'Back-sync disparado. Veja o log do servidor.' };
  }

  // Rotas /send-to-supplier e /resend foram removidas — para consumíveis
  // a integração com o Linx é automática no convert (sem etapa de
  // e-mail). O EmailService e o status SENT_TO_SUPPLIER seguem no
  // schema reservados para o módulo de Produto Acabado (PA) futuro,
  // que terá fluxo de envio próprio.

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela o pedido de compra (com justificativa)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.canceller.cancel(user, id, dto.cancellationReason);
  }

  @Post(':id/edit')
  @ApiOperation({
    summary:
      'Edita o pedido (volta pra fluxo de aprovação e Linx em "em estudo")',
  })
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditPurchaseOrderDto,
  ) {
    return this.editor.edit(user, id, dto);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Histórico de alterações do pedido (timeline)' })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.historyService.getEvents(user, id);
  }

  @Post(':id/cancel-items')
  @ApiOperation({
    summary: 'Cancela só o saldo de itens em aberto (PRD RN-OC-03)',
  })
  cancelItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderItemsDto,
  ) {
    return this.canceller.cancelItems(user, id, {
      itemIds: dto.itemIds,
      reason: dto.reason,
    });
  }
}
