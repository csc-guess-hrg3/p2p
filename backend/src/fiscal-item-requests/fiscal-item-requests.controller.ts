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
import { CreateFiscalItemRequestDto } from './dto/create-fiscal-item-request.dto';
import {
  ApproveFiscalItemRequestDto,
  RejectFiscalItemRequestDto,
} from './dto/resolve-fiscal-item-request.dto';
import { QueryFiscalItemRequestsDto } from './dto/query-fiscal-item-requests.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Pendências Fiscais de Item')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fiscal-item-requests')
export class FiscalItemRequestsController {
  constructor(private readonly service: FiscalItemRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Abre uma pendência fiscal de item' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFiscalItemRequestDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista pendências fiscais (fila da equipe Fiscal)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryFiscalItemRequestsDto,
  ) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma pendência fiscal' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Aprova a pendência e grava no Linx' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveFiscalItemRequestDto,
  ) {
    return this.service.approve(user, id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Rejeita a pendência fiscal' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectFiscalItemRequestDto,
  ) {
    return this.service.reject(user, id, dto);
  }
}
