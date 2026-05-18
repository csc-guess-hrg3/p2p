import { Module } from '@nestjs/common';
import { ReceivingService } from './receiving.service';
import { ReceivingController } from './receiving.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [ReceivingController],
  providers: [ReceivingService],
  exports: [ReceivingService],
})
export class ReceivingModule {}
