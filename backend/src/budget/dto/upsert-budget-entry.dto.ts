import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/** Cadastro manual de uma linha de orçamento (filial × CC × ano/mês). */
export class UpsertBudgetEntryDto {
  @IsString()
  @IsNotEmpty()
  branchErpCode!: string;

  @IsString()
  @IsNotEmpty()
  costCenterErpCode!: string;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Min(0)
  amountBudgeted!: number;
}
