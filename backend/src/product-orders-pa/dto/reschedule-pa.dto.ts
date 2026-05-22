import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Reagendamento de entrega de pedido PA.
 *
 * scope='order' move tudo (produto/cor/entregaOriginal ignorados).
 * scope='item' exige a chave (produto, cor, entregaOriginal) do ERP.
 */
export class ReschedulePaDto {
  @IsIn(['order', 'item'])
  scope!: 'order' | 'item';

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(5, { message: 'Motivo precisa de no mínimo 5 caracteres.' })
  reason!: string;

  @IsOptional()
  @IsString()
  produto?: string;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsDateString()
  entregaOriginal?: string;
}
