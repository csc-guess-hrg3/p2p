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
  @ApiOperation({ summary: 'Marca o pedido como enviado ao fornecedor' })
  sendToSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.purchaseOrders.sendToSupplier(user, id);
  }
}
