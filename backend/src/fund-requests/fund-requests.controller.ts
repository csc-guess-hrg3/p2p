import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FundRequestsService } from './fund-requests.service';
import { QueryFundRequestsDto } from './dto/query-fund-requests.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Solicitações de Verba')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fund-requests')
export class FundRequestsController {
  constructor(private readonly fundRequests: FundRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista solicitações de verba do escopo do usuário' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryFundRequestsDto,
  ) {
    return this.fundRequests.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da solicitação de verba' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fundRequests.findOne(user, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Timeline cronológica da SV' })
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fundRequests.history(user, id);
  }
}
