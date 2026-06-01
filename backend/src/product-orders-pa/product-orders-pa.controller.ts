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
import { ProductOrdersPaService } from './product-orders-pa.service';
import { RejectPaDto } from './dto/reject-pa.dto';
import { ReschedulePaDto } from './dto/reschedule-pa.dto';
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

  @Get(':pedido/nfes')
  @ApiOperation({
    summary:
      'NFes (ENTRADAS) vinculadas ao pedido PA + cross-ref com fiscal_documents',
  })
  listNfes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
  ) {
    return this.service.listNfes(user, company, pedido);
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

  @Post(':pedido/approve')
  @ApiOperation({ summary: 'Aprova um pedido PA (status E → A)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
  ) {
    return this.service.approve(user, company, pedido);
  }

  @Post(':pedido/reschedule')
  @ApiOperation({ summary: 'Reagenda entrega de um pedido PA (DE/PARA)' })
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
    @Body() dto: ReschedulePaDto,
  ) {
    return this.service.reschedule(user, company, pedido, dto);
  }

  @Post(':pedido/reject')
  @ApiOperation({ summary: 'Reprova um pedido PA (status E → R)' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Param('pedido') pedido: string,
    @Body() dto: RejectPaDto,
  ) {
    return this.service.reject(user, company, pedido, dto.reason);
  }
}
