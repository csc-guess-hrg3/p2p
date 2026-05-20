import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FinancialService } from './financial.service';

// Stub — Fase 2. Ver DECISIONS § 1.4.
@ApiExcludeController()
@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}
}
