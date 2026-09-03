import { IsBoolean, IsIn, IsOptional } from 'class-validator';

/** Liga/desliga o controle orçamentário e escolhe a política no estouro. */
export class SetBudgetConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['INFORMATIVE', 'BLOCKING'])
  policy?: 'INFORMATIVE' | 'BLOCKING';
}
