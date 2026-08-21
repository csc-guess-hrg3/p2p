import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BudgetService } from './budget.service';
import { UpsertBudgetEntryDto } from './dto/upsert-budget-entry.dto';
import { SetBudgetConfigDto } from './dto/set-budget-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Controle Orçamentário (André/OBS-03) — cadastro do orçamento + política.
 * Admin-only nesta fase. Rotas por empresa (companyId).
 */
@ApiTags('Orçamento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('budget')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get(':companyId/config')
  @ApiOperation({ summary: 'Config do controle orçamentário da empresa' })
  getConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
  ) {
    return this.budget.getConfig(user, companyId);
  }

  @Put(':companyId/config')
  @ApiOperation({
    summary: 'Liga/desliga o controle e define a política (informativo/impeditivo)',
  })
  setConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Body() dto: SetBudgetConfigDto,
  ) {
    return this.budget.setConfig(user, companyId, dto);
  }

  @Get(':companyId/entries')
  @ApiOperation({ summary: 'Orçamento lançado (filial × CC × ano/mês)' })
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Query('year') year?: string,
  ) {
    return this.budget.listEntries(
      user,
      companyId,
      year ? Number(year) : undefined,
    );
  }

  @Post(':companyId/entries')
  @ApiOperation({ summary: 'Cadastra/atualiza uma linha de orçamento' })
  upsertEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Body() dto: UpsertBudgetEntryDto,
  ) {
    return this.budget.upsertEntry(user, companyId, dto);
  }
}
