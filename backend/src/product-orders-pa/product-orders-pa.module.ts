import { Module } from '@nestjs/common';
import { ProductOrdersPaService } from './product-orders-pa.service';
import { ProductOrdersPaController } from './product-orders-pa.controller';

@Module({
  providers: [ProductOrdersPaService],
  controllers: [ProductOrdersPaController],
  exports: [ProductOrdersPaService],
})
export class ProductOrdersPaModule {}
