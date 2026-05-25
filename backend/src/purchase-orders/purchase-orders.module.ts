import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderHistoryService } from './purchase-order-history.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { IntegrationModule } from '../integration/integration.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [IntegrationModule, NumberingModule, ApprovalsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrderHistoryService],
  exports: [PurchaseOrdersService, PurchaseOrderHistoryService],
})
export class PurchaseOrdersModule {}
