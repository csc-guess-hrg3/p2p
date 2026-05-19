import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Classificação fiscal da requisição — preenchida pelo Revisor/Fiscal
 * antes da conversão em Pedido de Compra. Define o tipo de operação
 * contábil e a natureza de entrada que serão usados na gravação do Linx.
 */
export class FiscalClassifyDto {
  @ApiProperty({ description: 'CTB_TIPO_OPERACAO (entrada)' })
  @IsInt()
  ctbTipoOperacao!: number;

  @ApiProperty({ description: 'NATUREZA_ENTRADA pertencente ao CTB acima' })
  @IsString()
  @IsNotEmpty()
  naturezaEntrada!: string;

  @ApiPropertyOptional({
    description: 'Tipo de compra Linx — pode ser sobrescrito pelo fiscal',
  })
  @IsOptional()
  @IsString()
  tipoCompra?: string;
}
