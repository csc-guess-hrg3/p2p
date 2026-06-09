import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Linha de um recebimento — quantidade recebida de um item do pedido. */
export class CreateReceivingItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  purchaseOrderItemId!: string;

  @ApiProperty({ description: 'Quantidade fisicamente recebida' })
  @IsNumber()
  @Min(0)
  receivedQty!: number;

  @ApiProperty({ description: 'Quantidade aceita (entra no saldo do pedido)' })
  @IsNumber()
  @Min(0)
  acceptedQty!: number;

  @ApiPropertyOptional({ description: 'Quantidade rejeitada', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

/** Registro de recebimento/medição contra um Pedido de Compra. */
export class CreateReceivingDto {
  @ApiProperty({ description: 'ID do pedido de compra recebido' })
  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @ApiPropertyOptional({
    description: 'Data do recebimento (ISO 8601). Padrão: agora.',
  })
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @ApiPropertyOptional({ description: 'Início da medição (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  measurementStart?: string;

  @ApiPropertyOptional({ description: 'Fim da medição (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  measurementEnd?: string;

  @ApiPropertyOptional({
    description: 'Percentual de conclusão (medição de serviços)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  completionPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateReceivingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReceivingItemDto)
  items!: CreateReceivingItemDto[];
}
