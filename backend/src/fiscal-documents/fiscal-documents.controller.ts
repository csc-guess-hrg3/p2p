import { Controller } from '@nestjs/common';
import { FiscalDocumentsService } from './fiscal-documents.service';

@Controller('fiscal-documents')
export class FiscalDocumentsController {
  constructor(private readonly fiscalDocumentsService: FiscalDocumentsService) {}
}
