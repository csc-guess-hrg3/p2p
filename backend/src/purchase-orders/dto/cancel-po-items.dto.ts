import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

/**
 * PRD RN-OC-03: cancela só o saldo dos itens informados (qtde original
 * menos qtde recebida). Pedido só vira CANCELLED se sobrar nada aberto.
 */
export class CancelPurchaseOrderItemsDto {
  @ApiProperty({ type: [String], description: 'IDs dos itens a cancelar' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  itemIds!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(5, { message: 'Motivo precisa de no mínimo 5 caracteres.' })
  reason!: string;
}
