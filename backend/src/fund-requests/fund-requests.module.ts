import { Module } from '@nestjs/common';
import { FundRequestsService } from './fund-requests.service';
import { FundRequestsController } from './fund-requests.controller';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [IntegrationModule],
  controllers: [FundRequestsController],
  providers: [FundRequestsService],
  exports: [FundRequestsService],
})
export class FundRequestsModule {}
