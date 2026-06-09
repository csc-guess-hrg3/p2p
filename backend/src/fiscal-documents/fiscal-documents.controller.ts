import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Documentos Fiscais (NFe)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fiscal-documents')
export class FiscalDocumentsController {
  constructor(private readonly fiscalDocuments: FiscalDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista NFes baixadas da Qive (paginado)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('supplierCnpj') supplierCnpj?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.fiscalDocuments.findAll(user, {
      companyId,
      status,
      supplierCnpj,
      search,
      from,
      to,
      sortBy,
      sortDir,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('admin/sync/status')
  @ApiOperation({ summary: 'Status atual do sync com a Qive (UI polling)' })
  syncStatus(@Query('companyId') companyId?: string) {
    return this.fiscalDocuments.getSyncStatus(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da NFe (XML parseado + status)' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalDocuments.findOne(user, id);
  }

  @Get(':id/candidates')
  @ApiOperation({ summary: 'PCs candidatos para vincular a esta NFe' })
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalDocuments.candidatesForLink(user, id);
  }

  @Post(':id/link/:purchaseOrderId')
  @ApiOperation({ summary: 'Vincula a NFe a um PC' })
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('purchaseOrderId') purchaseOrderId: string,
  ) {
    return this.fiscalDocuments.linkToPo(user, id, purchaseOrderId);
  }

  @Get(':id/legacy-candidates')
  @ApiOperation({
    summary: 'Pedidos legados (Linx) onde essa NF já está lançada',
  })
  legacyCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.fiscalDocuments.findLegacyCandidates(user, id);
  }

  @Post(':id/link-legacy')
  @ApiOperation({ summary: 'Vincula a NFe a um pedido legado (Linx)' })
  linkLegacy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { legacyPedido: string; legacyCompanyId: string },
  ) {
    return this.fiscalDocuments.linkToLegacy(
      user,
      id,
      body.legacyPedido,
      body.legacyCompanyId,
    );
  }

  @Delete(':id/link')
  @ApiOperation({ summary: 'Desvincula a NFe do PC atual' })
  unlink(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalDocuments.unlinkFromPo(user, id);
  }

  @Post(':id/ignore')
  @ApiOperation({ summary: 'Marca a NFe como ignorada (não vira PC)' })
  ignore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.fiscalDocuments.markIgnored(user, id, reason);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Retorna a NFe pro status PENDING' })
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fiscalDocuments.restorePending(user, id);
  }

  @Get(':id/xml')
  @ApiOperation({ summary: 'Baixa o XML cru da NFe' })
  async downloadXml(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { xml, filename } = await this.fiscalDocuments.getXml(user, id);
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(Buffer.from(xml, 'utf8'));
  }

  @Get(':id/danfe')
  @ApiOperation({ summary: 'Baixa o DANFe (PDF) — read-through na Qive' })
  async downloadDanfe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { pdf, filename } = await this.fiscalDocuments.getDanfe(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }

  @Get('by-po/:purchaseOrderId')
  @ApiOperation({ summary: 'NFes vinculadas a um PC' })
  findByPo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('purchaseOrderId') purchaseOrderId: string,
  ) {
    return this.fiscalDocuments.findByPurchaseOrder(user, purchaseOrderId);
  }

  @Post('fetch-by-chave/:chave')
  @ApiOperation({
    summary: 'Busca a NFe na Qive pela chave e persiste no P2P (idempotente)',
  })
  fetchByChave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chave') chave: string,
    @Body() body: { legacyPedido?: string; legacyCompanyId?: string } = {},
  ) {
    return this.fiscalDocuments.fetchByChave(user, chave, {
      legacyPedido: body.legacyPedido,
      legacyCompanyId: body.legacyCompanyId,
    });
  }

  @Post('admin/reparse')
  @ApiOperation({
    summary: 'Re-parseia rawXmlBase64 das NFs (ADMIN, idempotente)',
  })
  triggerReparse(@CurrentUser() user: AuthenticatedUser) {
    return this.fiscalDocuments.reparseAll(user);
  }

  @Post('admin/sync')
  @ApiOperation({
    summary:
      'Dispara sync da Qive (background) pra uma empresa específica — retorna imediato',
  })
  triggerSync(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    if (user.profile !== 'ADMIN') {
      return { ok: false, error: 'Apenas ADMIN pode disparar sync manual' };
    }
    if (!companyId) {
      return {
        ok: false,
        error: 'companyId é obrigatório (passe pela query string)',
      };
    }
    return this.fiscalDocuments.startBackgroundSync(companyId);
  }
}
