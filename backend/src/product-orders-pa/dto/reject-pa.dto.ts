import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectPaDto {
  @ApiProperty({ description: 'Motivo da reprovação (mín. 10 caracteres)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'O motivo deve ter ao menos 10 caracteres.' })
  reason!: string;
}
