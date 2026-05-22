import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { IntegrationModule } from '../integration/integration.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [IntegrationModule, NumberingModule, ApprovalsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
