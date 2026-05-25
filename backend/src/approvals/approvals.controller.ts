import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { DecideDto } from './dto/decide.dto';
import { RequestRevisionDto } from './dto/request-revision.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Aprovações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Minhas aprovações pendentes (aprovador)' })
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.pendingForUser(user);
  }

  @Get('mine-waiting')
  @ApiOperation({
    summary: 'Minhas requisições aguardando aprovação (solicitante)',
  })
  mineWaiting(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.mineWaitingApproval(user);
  }

  @Post(':stepId/decide')
  @ApiOperation({ summary: 'Aprova ou rejeita uma etapa de aprovação' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: DecideDto,
  ) {
    return this.approvals.decide(user, stepId, dto.approved, dto.comments);
  }

  @Post(':stepId/request-revision')
  @ApiOperation({
    summary: 'Devolve o documento para o solicitante com pedido de revisão',
  })
  requestRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.approvals.requestRevision(user, stepId, dto.reason);
  }
}
