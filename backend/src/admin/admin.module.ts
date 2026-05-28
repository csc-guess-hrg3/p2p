import { Module } from '@nestjs/common';
import { AdSyncService } from './ad-sync.service';
import { AdSyncController } from './ad-sync.controller';
import { SuppliersAdminController } from './suppliers.controller';
import { IntegrationModule } from '../integration/integration.module';

/**
 * Recursos administrativos que não cabem em outros módulos.
 */
@Module({
  imports: [IntegrationModule],
  controllers: [AdSyncController, SuppliersAdminController],
  providers: [AdSyncService],
})
export class AdminModule {}
