import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Tecnologia da Informação' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Empresa de origem da equipe (rótulo p/ identificar; não restringe onde opera).',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
