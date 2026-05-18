import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Ajuste de preço negociado de um item, no momento da conversão. */
export class PoItemAdjustmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requisitionItemId!: string;

  @ApiProperty({ description: 'Preço unitário negociado' })
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

/**
 * Conversão de uma requisição aprovada em Pedido de Compra.
 * O comprador completa os campos do pedido e, opcionalmente, ajusta os
 * preços unitários (de estimado para negociado).
 */
export class ConvertToPurchaseOrderDto {
  @ApiProperty({ description: 'ID da requisição aprovada a converter' })
  @IsString()
  @IsNotEmpty()
  requisitionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Data de entrega prevista (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  expectedDelivery?: string;

  @ApiPropertyOptional({
    type: [PoItemAdjustmentDto],
    description: 'Preços negociados; itens não listados mantêm o estimado',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoItemAdjustmentDto)
  items?: PoItemAdjustmentDto[];
}
