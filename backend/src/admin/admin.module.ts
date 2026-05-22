import { Module } from '@nestjs/common';
import { AdSyncService } from './ad-sync.service';
import { AdSyncController } from './ad-sync.controller';

/**
 * Recursos administrativos que não cabem em outros módulos. Por enquanto
 * só o sync com Active Directory.
 */
@Module({
  controllers: [AdSyncController],
  providers: [AdSyncService],
})
export class AdminModule {}
