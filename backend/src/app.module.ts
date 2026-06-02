import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { NumberingModule } from './numbering/numbering.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TeamsModule } from './teams/teams.module';
import { PositionsModule } from './positions/positions.module';
import { BranchesModule } from './branches/branches.module';
import { BudgetModule } from './budget/budget.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { DelegationsModule } from './delegations/delegations.module';
import { RequisitionsModule } from './requisitions/requisitions.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { FundRequestsModule } from './fund-requests/fund-requests.module';
import { ReceivingModule } from './receiving/receiving.module';
import { SettingsModule } from './settings/settings.module';
import { FiscalItemRequestsModule } from './fiscal-item-requests/fiscal-item-requests.module';
import { FiscalDocumentsModule } from './fiscal-documents/fiscal-documents.module';
import { LegacyOrdersModule } from './legacy-orders/legacy-orders.module';
import { FinancialModule } from './financial/financial.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationModule } from './integration/integration.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ProductOrdersPaModule } from './product-orders-pa/product-orders-pa.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Jobs agendados (cron). Hoje só rodam: notificação PA pendente.
    ScheduleModule.forRoot(),
    // Throttle global — 300 req / minuto por IP. App interno corporativo,
    // com uploads/downloads de anexos em burst (preview, listas com
    // várias chamadas paralelas, etc.) — 60/min era curto demais.
    // Endpoints sensíveis (login) mantém throttle adicional via @Throttle.
    // O controller de anexos usa @SkipThrottle pra não bloquear bursts
    // de download (várias cotações abertas em sequência).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },
    ]),
    CryptoModule,
    PrismaModule,
    HealthModule,
    NumberingModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    TeamsModule,
    PositionsModule,
    BranchesModule,
    BudgetModule,
    ApprovalsModule,
    DelegationsModule,
    RequisitionsModule,
    PurchaseOrdersModule,
    FundRequestsModule,
    ReceivingModule,
    SettingsModule,
    FiscalItemRequestsModule,
    FiscalDocumentsModule,
    LegacyOrdersModule,
    FinancialModule,
    DashboardModule,
    ReportsModule,
    IntegrationModule,
    AttachmentsModule,
    QuotationsModule,
    ProductOrdersPaModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
