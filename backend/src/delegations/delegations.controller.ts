import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DelegationsService } from './delegations.service';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Delegações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('delegations')
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma delegação da própria alçada' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDelegationDto,
  ) {
    return this.delegations.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista delegações (type=given concedidas | received recebidas)',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query('type') type?: string) {
    return type === 'received'
      ? this.delegations.listReceived(user.id)
      : this.delegations.listGiven(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancela uma delegação' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.delegations.cancel(user, id);
  }
}
