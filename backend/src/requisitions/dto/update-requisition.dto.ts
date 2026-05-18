import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  neededBy?: string;

  @ApiPropertyOptional({ type: [CreateRequisitionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionItemDto)
  items?: CreateRequisitionItemDto[];
}
