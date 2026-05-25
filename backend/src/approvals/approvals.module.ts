import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalEngineService } from './approval-engine.service';
import { IntegrationModule } from '../integration/integration.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [IntegrationModule, NotificationsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ApprovalEngineService],
  exports: [ApprovalsService, ApprovalEngineService],
})
export class ApprovalsModule {}
