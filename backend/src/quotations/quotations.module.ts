import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationModule } from '../integration/integration.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { SupplierValidationModule } from '../supplier-validation/supplier-validation.module';

@Module({
  imports: [
    PrismaModule,
    IntegrationModule,
    ApprovalsModule,
    SupplierValidationModule,
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
