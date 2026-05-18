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
import { ReceivingService } from './receiving.service';
import { CreateReceivingDto } from './dto/create-receiving.dto';
import { QueryReceivingsDto } from './dto/query-receivings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Recebimentos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('receiving')
export class ReceivingController {
  constructor(private readonly receiving: ReceivingService) {}

  @Post()
  @ApiOperation({ summary: 'Registra um recebimento contra um pedido de compra' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReceivingDto,
  ) {
    return this.receiving.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista recebimentos do escopo do usuário' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryReceivingsDto,
  ) {
    return this.receiving.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do recebimento' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.receiving.findOne(user, id);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirma o recebimento e atualiza o saldo do pedido' })
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.receiving.confirm(user, id);
  }
}
