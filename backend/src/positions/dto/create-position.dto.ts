import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePositionDto {
  @ApiProperty({
    description:
      'Chave técnica estável do cargo (ex.: SUPERVISOR). Letras, números e _ apenas.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Z0-9_]+$/i, {
    message: 'Code deve conter apenas letras, números e underscore.',
  })
  code!: string;

  @ApiProperty({ description: 'Rótulo apresentado na UI.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
