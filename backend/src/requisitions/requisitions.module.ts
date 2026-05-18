import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { IntegrationModule } from '../integration/integration.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [IntegrationModule, ApprovalsModule],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
