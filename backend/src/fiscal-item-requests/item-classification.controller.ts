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
import { FiscalItemRequestsService } from './fiscal-item-requests.service';
import { QueryFiscalItemRequestsDto } from './dto/query-fiscal-item-requests.dto';
import {
  CreateClassifiedItemDto,
  LinkItemDto,
} from './dto/classify-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Classificação de itens LIVRES (descrição solta que o solicitante escreveu).
 * A equipe fiscal vincula um item existente OU cria um novo no Linx — em
 * ambos a conta contábil volta pro item da requisição.
 */
@ApiTags('Classificação de Item')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('item-classification')
export class ItemClassificationController {
  constructor(private readonly service: FiscalItemRequestsService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Fila de itens livres aguardando classificação' })
  queue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryFiscalItemRequestsDto,
  ) {
    return this.service.classificationQueue(user, query);
  }

  @Get(':reqItemId/suggestions')
  @ApiOperation({ summary: 'Itens existentes parecidos com a descrição' })
  suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reqItemId') reqItemId: string,
  ) {
    return this.service.classificationSuggestions(user, reqItemId);
  }

  @Post(':reqItemId/link')
  @ApiOperation({ summary: 'Vincula um item existente ao item livre' })
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reqItemId') reqItemId: string,
    @Body() dto: LinkItemDto,
  ) {
    return this.service.resolveLink(user, reqItemId, dto);
  }

  @Post(':reqItemId/create')
  @ApiOperation({
    summary:
      'Cria um item fiscal novo no Linx e vincula (confirm:false = só prévia)',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reqItemId') reqItemId: string,
    @Body() dto: CreateClassifiedItemDto,
  ) {
    return this.service.resolveCreate(user, reqItemId, dto);
  }
}
