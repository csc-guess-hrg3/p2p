import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Abertura de uma pendência fiscal de VÍNCULO item-fornecedor.
 * O item já existe no catálogo do Linx; falta vinculá-lo ao fornecedor.
 * O cadastro de itens novos é feito diretamente no Linx.
 */
export class CreateFiscalItemRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Código do fornecedor no ERP' })
  @IsString()
  @IsNotEmpty()
  supplierErpCode!: string;

  @ApiProperty({ description: 'Código do item no catálogo do Linx' })
  @IsString()
  @IsNotEmpty()
  itemErpCode!: string;

  @ApiProperty({ description: 'Descrição do item' })
  @IsString()
  @IsNotEmpty()
  itemDescription!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
