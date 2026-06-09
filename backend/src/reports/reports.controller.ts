import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Relatórios (PRD § 13)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('rel-001-suppliers-no-cc')
  @ApiOperation({
    summary:
      'REL-001 — Fornecedores sem CC associado (sem pedidos nos últimos 90d)',
  })
  rel001(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.reports.suppliersWithoutCostCenter(user, companyId);
  }

  @Get('rel-002-overdue-orders-30d')
  @ApiOperation({ summary: 'REL-002 — Pedidos em atraso > 30 dias' })
  rel002(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.reports.overdueOrdersOver30Days(user, companyId);
  }

  @Get('rel-003-budget-by-branch-cc')
  @ApiOperation({
    summary: 'REL-003 — Consumo orçamentário por filial/CC (mês corrente)',
  })
  rel003(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.budgetByBranchCostCenter(
      user,
      companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }
}
