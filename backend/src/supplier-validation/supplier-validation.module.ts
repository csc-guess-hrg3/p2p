import { Module } from '@nestjs/common';
import { SupplierValidationService } from './supplier-validation.service';
import { SupplierValidationController } from './supplier-validation.controller';
import { IntegrationModule } from '../integration/integration.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [IntegrationModule, NotificationsModule, ApprovalsModule],
  controllers: [SupplierValidationController],
  providers: [SupplierValidationService],
  exports: [SupplierValidationService],
})
export class SupplierValidationModule {}
