import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class EditPoItem {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;
}

export class EditPurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Motivo da edição — obrigatório.' })
  @IsString()
  @MinLength(5, { message: 'Motivo precisa de no mínimo 5 caracteres.' })
  reason!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() paymentCondition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transportadora?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAddress?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDelivery?: string;

  @ApiPropertyOptional({ type: [EditPoItem] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditPoItem)
  items?: EditPoItem[];
}
