import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** RN-OC-02: cancelamento exige justificativa registrada em auditoria. */
export class CancelPurchaseOrderDto {
  @ApiProperty({ description: 'Motivo do cancelamento (mín. 10 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'O motivo deve ter ao menos 10 caracteres.' })
  cancellationReason!: string;
}
