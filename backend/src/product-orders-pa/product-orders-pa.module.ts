import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ProductOrdersPaService } from './product-orders-pa.service';
import { ProductOrdersPaController } from './product-orders-pa.controller';
import { PaNotificationService } from './pa-notification.service';

@Module({
  imports: [CryptoModule],
  providers: [ProductOrdersPaService, PaNotificationService],
  controllers: [ProductOrdersPaController],
  exports: [ProductOrdersPaService],
})
export class ProductOrdersPaModule {}
