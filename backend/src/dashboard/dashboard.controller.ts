import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Resumo dos 3 KPIs do dashboard' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.summary(user, query.companyId);
  }

  @Get('open-orders')
  @ApiOperation({ summary: 'Drill-down: pedidos em aberto' })
  openOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.openOrders(user, query.companyId);
  }

  @Get('overdue-orders')
  @ApiOperation({ summary: 'Drill-down: pedidos em atraso' })
  overdueOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.overdueOrders(user, query.companyId);
  }

  @Get('budget-consumption')
  @ApiOperation({ summary: 'Drill-down: consumo orçamentário por centro de custo' })
  budgetConsumption(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.budgetConsumption(user, query.companyId);
  }

  @Get('orders-by-month')
  @ApiOperation({ summary: 'Pedidos criados por mês (últimos 6)' })
  ordersByMonth(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.ordersByMonth(user, query.companyId);
  }

  @Get('top-suppliers')
  @ApiOperation({ summary: 'Top fornecedores do mês corrente' })
  topSuppliers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.topSuppliers(user, query.companyId);
  }

  @Get('orders-by-status')
  @ApiOperation({ summary: 'Distribuição de pedidos por status' })
  ordersByStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.ordersByStatus(user, query.companyId);
  }

  @Get('my-actions')
  @ApiOperation({ summary: 'Minhas ações pendentes (counts)' })
  myActions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboard.myActions(user, query.companyId);
  }
}
