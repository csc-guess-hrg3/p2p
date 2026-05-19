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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Mínimo 50 caracteres' })
  @IsOptional()
  @IsString()
  @MinLength(50, {
    message: 'A justificativa deve ter no mínimo 50 caracteres.',
  })
  justification?: string;

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

  @ApiPropertyOptional({ type: [CreateRequisitionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionItemDto)
  items?: CreateRequisitionItemDto[];
}
