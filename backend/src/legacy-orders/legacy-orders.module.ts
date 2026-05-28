import { Module } from '@nestjs/common';
import { LegacyOrdersService } from './legacy-orders.service';
import { LegacyOrdersController } from './legacy-orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [PrismaModule, IntegrationModule],
  controllers: [LegacyOrdersController],
  providers: [LegacyOrdersService],
  exports: [LegacyOrdersService],
})
export class LegacyOrdersModule {}
