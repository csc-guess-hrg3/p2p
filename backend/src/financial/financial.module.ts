import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { FinancialAlertsService } from './financial-alerts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModuleGuard } from '../common/guards/module.guard';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FinancialController],
  providers: [FinancialService, FinancialAlertsService, ModuleGuard],
  exports: [FinancialService],
})
export class FinancialModule {}
