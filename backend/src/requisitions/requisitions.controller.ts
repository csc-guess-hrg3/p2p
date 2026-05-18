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

  @Patch(':id')
  @ApiOperation({ summary: 'Edita uma requisição em rascunho' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    return this.requisitions.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui uma requisição em rascunho' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.remove(user, id);
  }
}
