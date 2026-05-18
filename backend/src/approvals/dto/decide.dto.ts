import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideDto {
  @ApiProperty({ description: 'true = aprovar, false = rejeitar' })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({
    description: 'Comentário (obrigatório recomendado na rejeição)',
  })
  @IsOptional()
  @IsString()
  comments?: string;
}
