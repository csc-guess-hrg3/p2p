import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HealthModule } from './health/health.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { NumberingModule } from './numbering/numbering.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TeamsModule } from './teams/teams.module';
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
import { FinancialModule } from './financial/financial.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationModule } from './integration/integration.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ProductOrdersPaModule } from './product-orders-pa/product-orders-pa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Throttle global — 60 req / minuto por IP por padrão.
    // Endpoints sensíveis (login) recebem throttle adicional via @Throttle.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
    ]),
    CryptoModule,
    PrismaModule,
    HealthModule,
    NumberingModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    TeamsModule,
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
    FinancialModule,
    DashboardModule,
    ReportsModule,
    IntegrationModule,
    AttachmentsModule,
    ProductOrdersPaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
