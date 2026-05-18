import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RequisitionNfType } from '../../common/enums';

export class CreateRequisitionItemDto {
  @ApiPropertyOptional({ description: 'Código do item no ERP (vazio = item livre)' })
  @IsOptional()
  @IsString()
  itemErpCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemDescription!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  estimatedPrice!: number;

  @ApiProperty({ description: 'Conta contábil (CONTA_CONTABIL do ERP)' })
  @IsString()
  @IsNotEmpty()
  accountingAccount!: string;

  @ApiProperty({ description: 'Código do template de rateio de filial' })
  @IsString()
  @IsNotEmpty()
  branchRateioCode!: string;

  @ApiProperty({ description: 'Código do template de rateio de centro de custo' })
  @IsString()
  @IsNotEmpty()
  costCenterRateioCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRequisitionDto {
  @ApiProperty({ description: 'ID da empresa (P2P)' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Código da filial principal no ERP' })
  @IsString()
  @IsNotEmpty()
  branchErpCode!: string;

  @ApiProperty({ description: 'Código do fornecedor no ERP' })
  @IsString()
  @IsNotEmpty()
  supplierErpCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Justificativa (mínimo 50 caracteres)' })
  @IsString()
  @MinLength(50, {
    message: 'A justificativa deve ter no mínimo 50 caracteres.',
  })
  justification!: string;

  @ApiProperty({ enum: Object.values(RequisitionNfType) })
  @IsIn(Object.values(RequisitionNfType))
  tipoNotaFiscal!: string;

  @ApiPropertyOptional({ description: 'Data necessária (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  neededBy?: string;

  @ApiProperty({ type: [CreateRequisitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionItemDto)
  items!: CreateRequisitionItemDto[];
}
