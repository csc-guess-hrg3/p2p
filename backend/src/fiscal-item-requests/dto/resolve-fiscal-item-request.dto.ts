import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Aprovação de uma pendência fiscal.
 * Para o tipo NEW, a equipe Fiscal informa o código do item a cadastrar
 * no Linx (e, opcionalmente, unidade, conta contábil e rateios padrão).
 */
export class ApproveFiscalItemRequestDto {
  @ApiPropertyOptional({ description: 'Código do item a cadastrar (tipo NEW)' })
  @IsOptional()
  @IsString()
  itemErpCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountingAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchRateioCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterRateioCode?: string;
}

export class RejectFiscalItemRequestDto {
  @ApiPropertyOptional({ description: 'Motivo da rejeição' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
