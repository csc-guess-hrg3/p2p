import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty({ description: 'ID do usuário que receberá a alçada' })
  @IsString()
  @IsNotEmpty()
  delegateId!: string;

  @ApiProperty({ description: 'Início da delegação (ISO 8601)' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ description: 'Fim da delegação (ISO 8601)' })
  @IsISO8601()
  endsAt!: string;

  @ApiPropertyOptional({ description: 'Motivo (ex.: férias)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
