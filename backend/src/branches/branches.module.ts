import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  providers: [BranchesService],
  controllers: [BranchesController]
})
export class BranchesModule {}
