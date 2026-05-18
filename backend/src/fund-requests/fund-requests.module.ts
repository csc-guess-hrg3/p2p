import { Module } from '@nestjs/common';
import { FundRequestsService } from './fund-requests.service';
import { FundRequestsController } from './fund-requests.controller';

@Module({
  controllers: [FundRequestsController],
  providers: [FundRequestsService],
  exports: [FundRequestsService],
})
export class FundRequestsModule {}
