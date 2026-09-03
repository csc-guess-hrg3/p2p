import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionRecurrenceService } from './requisition-recurrence.service';
import { IntegrationModule } from '../integration/integration.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { SupplierValidationModule } from '../supplier-validation/supplier-validation.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { SettingsModule } from '../settings/settings.module';
import { NumberingModule } from '../numbering/numbering.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    IntegrationModule,
    ApprovalsModule,
    SupplierValidationModule,
    PurchaseOrdersModule,
    SettingsModule,
    NumberingModule,
    NotificationsModule,
  ],
  controllers: [RequisitionsController],
  providers: [RequisitionsService, RequisitionRecurrenceService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
