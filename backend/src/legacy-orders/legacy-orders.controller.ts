import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LegacyOrdersService } from './legacy-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Pedidos Legados (Linx)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('legacy-orders')
export class LegacyOrdersController {
  constructor(private readonly legacyOrders: LegacyOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista pedidos consumível direto do Linx (Admin)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL',
    @Query('onlyWithNfe') onlyWithNfe?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.legacyOrders.list(user, {
      companyId,
      search,
      from,
      to,
      status,
      onlyWithNfe: onlyWithNfe === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':companyId/:pedido')
  @ApiOperation({ summary: 'Detalhe do pedido + itens + NFs vinculadas' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('pedido') pedido: string,
  ) {
    return this.legacyOrders.detail(user, companyId, pedido);
  }

  @Get(':companyId/:pedido/nfes')
  @ApiOperation({ summary: 'NFes (ENTRADAS) vinculadas ao pedido' })
  nfes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('pedido') pedido: string,
  ) {
    return this.legacyOrders.listNfes(user, companyId, pedido);
  }

  @Get('danfe/:chave')
  @ApiOperation({
    summary: 'Baixa DANFe (PDF) por chave NFe — read-through Qive',
  })
  async downloadDanfeByChave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chave') chave: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { pdf, filename } = await this.legacyOrders.getDanfeByChave(
      user,
      chave,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }
}
