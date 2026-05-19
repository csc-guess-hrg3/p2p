import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Abertura de uma pendência fiscal de item.
 *  LINK — o item existe no catálogo do Linx, falta vincular ao fornecedor;
 *         itemErpCode é obrigatório.
 *  NEW  — o item não existe; o usuário descreve e a equipe Fiscal cadastra.
 */
export class CreateFiscalItemRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ enum: ['LINK', 'NEW'] })
  @IsIn(['LINK', 'NEW'])
  type!: 'LINK' | 'NEW';

  @ApiProperty({ description: 'Código do fornecedor no ERP' })
  @IsString()
  @IsNotEmpty()
  supplierErpCode!: string;

  @ApiPropertyOptional({ description: 'Código do item (obrigatório quando LINK)' })
  @IsOptional()
  @IsString()
  itemErpCode?: string;

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
