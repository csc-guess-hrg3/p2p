import { Module } from '@nestjs/common';
import { FundRequestsService } from './fund-requests.service';
import { FundRequestsController } from './fund-requests.controller';
import { IntegrationModule } from '../integration/integration.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NumberingModule } from '../numbering/numbering.module';

@Module({
  imports: [IntegrationModule, ApprovalsModule, NumberingModule],
  controllers: [FundRequestsController],
  providers: [FundRequestsService],
  exports: [FundRequestsService],
})
export class FundRequestsModule {}
