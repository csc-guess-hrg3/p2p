import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'ID do gestor da equipe (null remove)' })
  @IsOptional()
  @IsString()
  managerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Empresa de origem da equipe (null remove a classificação).',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string | null;
}
