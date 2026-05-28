import {
  Body,
  Controller,
  Get,
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
  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly historyService: PurchaseOrderHistoryService,
    private readonly converter: PurchaseOrderConverterService,
    private readonly editor: PurchaseOrderEditorService,
    private readonly canceller: PurchaseOrderCancellerService,
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
