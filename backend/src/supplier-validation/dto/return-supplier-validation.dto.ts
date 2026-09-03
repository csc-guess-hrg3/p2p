import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Devolução de uma validação de fornecedor: exige um motivo, que volta pro
 * solicitante ajustar os dados do fornecedor e reenviar.
 */
export class ReturnSupplierValidationDto {
  @ApiProperty({ description: 'Motivo da devolução (mín. 3 caracteres).' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  justification!: string;
}
