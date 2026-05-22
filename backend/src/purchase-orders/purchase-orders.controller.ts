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
import { ConvertToPurchaseOrderDto } from './dto/convert-to-po.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { SendToSupplierDto } from './dto/send-to-supplier.dto';
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
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Converte uma requisição aprovada em Pedido de Compra',
  })
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConvertToPurchaseOrderDto,
  ) {
    return this.purchaseOrders.convert(user, dto);
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

  @Post(':id/send-to-supplier')
  @ApiOperation({
    summary: 'Envia o pedido ao fornecedor — grava no Linx e envia e-mail',
  })
  sendToSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendToSupplierDto,
  ) {
    return this.purchaseOrders.sendToSupplier(user, id, dto);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Reenvia o e-mail do pedido ao fornecedor' })
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendToSupplierDto,
  ) {
    return this.purchaseOrders.resendToSupplier(user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela o pedido de compra (com justificativa)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.purchaseOrders.cancel(user, id, dto.cancellationReason);
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
    return this.purchaseOrders.edit(user, id, dto);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Histórico de alterações do pedido (timeline)' })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.purchaseOrders.history(user, id);
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
    return this.purchaseOrders.cancelItems(user, id, {
      itemIds: dto.itemIds,
      reason: dto.reason,
    });
  }
}
