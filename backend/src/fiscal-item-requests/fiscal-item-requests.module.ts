import { Module } from '@nestjs/common';
import { FiscalItemRequestsService } from './fiscal-item-requests.service';
import { FiscalItemRequestsController } from './fiscal-item-requests.controller';
import { ItemClassificationController } from './item-classification.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [IntegrationModule],
  controllers: [FiscalItemRequestsController, ItemClassificationController],
  providers: [FiscalItemRequestsService],
  exports: [FiscalItemRequestsService],
})
export class FiscalItemRequestsModule {}
