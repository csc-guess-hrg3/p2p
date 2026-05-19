import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectFiscalItemRequestDto {
  @ApiProperty({ description: 'Motivo da rejeição' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
