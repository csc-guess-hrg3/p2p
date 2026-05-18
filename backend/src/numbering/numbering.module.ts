import { Global, Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';

/** Numeração de documentos — disponível globalmente. */
@Global()
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
