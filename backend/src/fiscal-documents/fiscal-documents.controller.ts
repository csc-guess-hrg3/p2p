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
  constructor(
    private readonly fiscalDocuments: FiscalDocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista NFes baixadas da Qive (paginado)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('supplierCnpj') supplierCnpj?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.fiscalDocuments.findAll(user, {
      status,
      supplierCnpj,
      search,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da NFe (XML parseado + status)' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.fiscalDocuments.findOne(user, id);
  }

  @Get(':id/candidates')
  @ApiOperation({ summary: 'PCs candidatos para vincular a esta NFe' })
  candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
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

  @Delete(':id/link')
  @ApiOperation({ summary: 'Desvincula a NFe do PC atual' })
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
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
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
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

  @Post('admin/sync')
  @ApiOperation({ summary: 'Dispara sync da Qive manualmente (admin)' })
  triggerSync(@CurrentUser() user: AuthenticatedUser) {
    // Guarda simples: só ADMIN. Sem RolesGuard separado pra não importar
    // mais um pedaço — o cron faz o mesmo trabalho a cada hora.
    if (user.profile !== 'ADMIN') {
      return { ok: false, error: 'Apenas ADMIN pode disparar sync manual' };
    }
    return this.fiscalDocuments.syncAll('received');
  }
}
