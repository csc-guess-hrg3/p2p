import { Module } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { CostCentersController } from './cost-centers.controller';

@Module({
  providers: [CostCentersService],
  controllers: [CostCentersController]
})
export class CostCentersModule {}
