import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { BudgetModule } from './budget/budget.module';
import { RequisitionsModule } from './requisitions/requisitions.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReceivingModule } from './receiving/receiving.module';
import { FiscalDocumentsModule } from './fiscal-documents/fiscal-documents.module';
import { FinancialModule } from './financial/financial.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationModule } from './integration/integration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    BudgetModule,
    RequisitionsModule,
    PurchaseOrdersModule,
    ReceivingModule,
    FiscalDocumentsModule,
    FinancialModule,
    DashboardModule,
    ReportsModule,
    IntegrationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
