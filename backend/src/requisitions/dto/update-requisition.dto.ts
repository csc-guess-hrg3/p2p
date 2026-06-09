import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateRequisitionItemDto } from './create-requisition.dto';

/**
 * Edição de requisição — permitida apenas em rascunho (DRAFT).
 * Se `items` for informado, substitui todos os itens.
 */
export class UpdateRequisitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchErpCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierErpCode?: string;

  @ApiPropertyOptional({
    description: 'CNPJ pra fornecedor externo (sem código no ERP).',
  })
  @IsOptional()
  @IsString()
  supplierCnpj?: string;

  @ApiPropertyOptional({
    description:
      'Nome manual quando o CNPJ não bate nem no ERP nem na Receita.',
  })
  @IsOptional()
  @IsString()
  supplierNameOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Mínimo 15 caracteres' })
  @IsOptional()
  @IsString()
  @MinLength(15, {
    message: 'A justificativa deve ter no mínimo 15 caracteres.',
  })
  justification?: string;

  @ApiPropertyOptional({
    description:
      'Motivo da edição. Obrigatório quando o próprio requisitante edita.',
  })
  @IsOptional()
  @IsString()
  editReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentConditionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  recurrenceMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractRef?: string;

  @ApiPropertyOptional({
    description: 'Número de cotações anexadas (RN-REQ-02).',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  quotationsCount?: number;

  @ApiPropertyOptional({ type: [CreateRequisitionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionItemDto)
  items?: CreateRequisitionItemDto[];
}
