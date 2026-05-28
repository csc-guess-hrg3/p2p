import { Module } from '@nestjs/common';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [PrismaModule, IntegrationModule],
  controllers: [FiscalDocumentsController],
  providers: [FiscalDocumentsService],
  exports: [FiscalDocumentsService],
})
export class FiscalDocumentsModule {}
