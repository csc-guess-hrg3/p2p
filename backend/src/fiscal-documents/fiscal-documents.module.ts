import { Module } from '@nestjs/common';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';

@Module({
  controllers: [FiscalDocumentsController],
  providers: [FiscalDocumentsService],
  exports: [FiscalDocumentsService],
})
export class FiscalDocumentsModule {}
