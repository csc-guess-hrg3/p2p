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
    @Query('statusAprovacao') statusAprovacao?: 'A' | 'P' | 'R' | 'E',
    @Query('nfeFilter') nfeFilter?: 'any' | 'with-nf' | 'with-chave',
    @Query('onlyWithNfe') onlyWithNfe?: string,
    @Query('valorMin') valorMin?: string,
    @Query('valorMax') valorMax?: string,
    @Query('filial') filial?: string,
    @Query('tipoCompra') tipoCompra?: string,
    @Query('requeridoPor') requeridoPor?: string,
    @Query('aprovadoPor') aprovadoPor?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.legacyOrders.list(user, {
      companyId,
      search,
      from,
      to,
      status,
      statusAprovacao,
      nfeFilter,
      onlyWithNfe: onlyWithNfe === 'true',
      valorMin: valorMin ? Number(valorMin) : undefined,
      valorMax: valorMax ? Number(valorMax) : undefined,
      filial,
      tipoCompra,
      requeridoPor,
      aprovadoPor,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('facets')
  @ApiOperation({
    summary: 'Valores únicos (filial, tipo, aprovador) pros selects',
  })
  facets(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.legacyOrders.listFacets(user, companyId);
  }

  // IMPORTANTE: rota literal ANTES das paramétricas `:companyId/:pedido`,
  // senão `/legacy-orders/danfe/<chave>` casa com `:companyId/:pedido`
  // (companyId='danfe') e quebra no resolveCompany (P2023).
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

  @Get(':companyId/:pedido')
  @ApiOperation({ summary: 'Detalhe do pedido + itens + NFs vinculadas' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('pedido') pedido: string,
  ) {
    return this.legacyOrders.detail(user, companyId, pedido);
  }

  @Get(':companyId/:pedido/financeiro-erp')
  @ApiOperation({
    summary:
      'Estado financeiro do pedido externo no Linx (faturado/pago) — mesmo ' +
      'read-through dos pedidos do P2P. Somente leitura.',
  })
  financeiro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Param('pedido') pedido: string,
  ) {
    return this.legacyOrders.financeiro(user, companyId, pedido);
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
}
