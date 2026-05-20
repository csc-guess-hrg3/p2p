import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

// Stub — Fase 2. Ver DECISIONS § 1.4.
@ApiExcludeController()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}
}
