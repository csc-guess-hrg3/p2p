import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FiscalDocumentsService } from './fiscal-documents.service';

// Stub — Fase 2. Ver DECISIONS § 1.4.
@ApiExcludeController()
@Controller('fiscal-documents')
export class FiscalDocumentsController {
  constructor(private readonly fiscalDocumentsService: FiscalDocumentsService) {}
}
