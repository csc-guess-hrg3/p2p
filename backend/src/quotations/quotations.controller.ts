import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

interface QuotationItemDto {
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
}

interface CreateQuotationDto {
  attachmentId?: string;
  supplierCnpj: string;
  supplierNameOverride?: string;
  paymentConditionCode?: string;
  notes?: string;
  items: QuotationItemDto[];
}

interface UpdateQuotationDto extends Partial<CreateQuotationDto> {}

@ApiTags('Cotações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get('requisitions/:id/quotations')
  @ApiOperation({ summary: 'Lista as cotações de uma requisição.' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') requisitionId: string,
  ) {
    return this.quotations.list(user, requisitionId);
  }

  @Post('requisitions/:id/quotations')
  @ApiOperation({
    summary:
      'Registra uma cotação na requisição. Faz lookup do CNPJ no ERP — se ' +
      'não cadastrado, exige `supplierNameOverride`.',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') requisitionId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotations.create(user, requisitionId, dto);
  }

  @Patch('quotations/:id')
  @ApiOperation({ summary: 'Edita uma cotação (rascunho ou revisão).' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') quotationId: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotations.update(user, quotationId, dto);
  }

  @Delete('quotations/:id')
  @ApiOperation({ summary: 'Remove uma cotação.' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') quotationId: string,
  ) {
    return this.quotations.remove(user, quotationId);
  }

  @Post('quotations/:id/select')
  @ApiOperation({
    summary:
      'Seleciona esta cotação como vencedora — substitui fornecedor + ' +
      'condição + itens da requisição. Exige justificativa (mín. 10 chars). ' +
      'Aprovador ou Admin.',
  })
  selectWinner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') quotationId: string,
    @Body() body: { reason?: string },
  ) {
    return this.quotations.selectAsWinner(user, quotationId, body?.reason ?? '');
  }

  @Post('requisitions/:id/quotations/clear-winner')
  @ApiOperation({
    summary:
      'Restaura a proposta original do solicitante — descarta a cotação ' +
      'vencedora atual. Aprovador ou Admin.',
  })
  clearWinner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') requisitionId: string,
  ) {
    return this.quotations.clearWinner(user, requisitionId);
  }
}
