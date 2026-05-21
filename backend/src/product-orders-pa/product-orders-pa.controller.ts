import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductOrdersPaService } from './product-orders-pa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Pedidos de Compra de PRODUTO ACABADO — leitura cross-database do Linx.
 * Rota raiz: /product-orders-pa/:company/...
 */
@ApiTags('Pedidos PA (Produto Acabado)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('product-orders-pa/:company')
export class ProductOrdersPaController {
  constructor(private readonly service: ProductOrdersPaService) {}

  @Get()
  @ApiOperation({ summary: 'Lista pedidos PA da empresa' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user, company, { status, search });
  }

  @Get(':pedido')
  @ApiOperation({ summary: 'Detalhe do pedido PA + lista de itens' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
  ) {
    return this.service.findOne(user, company, pedido);
  }

  @Get(':pedido/grade')
  @ApiOperation({
    summary: 'Grade vertical (posição → quantidade) de um item PA',
  })
  grade(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
    @Query('produto') produto: string,
    @Query('cor') cor: string,
    @Query('entrega') entrega: string,
  ) {
    return this.service.getItemGrade(
      user,
      company,
      pedido,
      produto,
      cor,
      entrega,
    );
  }
}
