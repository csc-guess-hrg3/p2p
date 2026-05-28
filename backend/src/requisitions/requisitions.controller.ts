import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { UpdateRequisitionDto } from './dto/update-requisition.dto';
import { QueryRequisitionsDto } from './dto/query-requisitions.dto';
import { FiscalClassifyDto } from './dto/fiscal-classify.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Requisições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma requisição (rascunho)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRequisitionDto,
  ) {
    return this.requisitions.create(user, dto);
  }

  @Post(':id/clone')
  @ApiOperation({
    summary:
      'Clona requisição existente como rascunho. O solicitante do clone é o usuário logado.',
  })
  clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.requisitions.clone(user, id);
  }

  @Get()
  @ApiOperation({ summary: 'Lista requisições do escopo do usuário' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryRequisitionsDto,
  ) {
    return this.requisitions.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da requisição' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.findOne(user, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Timeline cronológica da requisição' })
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.history(user, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submete a requisição para aprovação' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.submit(user, id);
  }

  @Post(':id/resubmit')
  @ApiOperation({
    summary:
      'Re-submete uma requisição em REVISION (sem precisar editar). ' +
      'Útil quando o solicitante anexou cotações que faltavam ou pediu dispensa.',
  })
  resubmit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.resubmitFromRevision(user, id);
  }

  @Post(':id/quotation-waiver')
  @ApiOperation({
    summary:
      'Solicita dispensa da regra de cotações (RN-REQ-02 — exceção). ' +
      'Body: { reason: CONTRATO_VIGENTE|RECORRENTE|UNICO_FORNECEDOR|EMERGENCIA|OUTRO, note: string }',
  })
  setQuotationWaiver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: { reason: string; note: string },
  ) {
    return this.requisitions.setQuotationWaiver(user, id, dto.reason, dto.note);
  }

  @Delete(':id/quotation-waiver')
  @ApiOperation({ summary: 'Remove a dispensa de cotação' })
  clearQuotationWaiver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.requisitions.clearQuotationWaiver(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita uma requisição em rascunho' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    return this.requisitions.update(user, id, dto);
  }

  @Patch(':id/fiscal-classify')
  @ApiOperation({
    summary: 'Classificação fiscal (CTB + natureza + tipo de compra)',
  })
  fiscalClassify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FiscalClassifyDto,
  ) {
    return this.requisitions.fiscalClassify(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui uma requisição em rascunho' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.remove(user, id);
  }
}
