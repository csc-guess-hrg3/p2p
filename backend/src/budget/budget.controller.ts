import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BudgetService } from './budget.service';

// Stub — Fase 2. Marcado como excluído do Swagger até ter conteúdo;
// mantemos no app.module.ts como ponto de extensão visível (DECISIONS § 1.4).
@ApiExcludeController()
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}
}
