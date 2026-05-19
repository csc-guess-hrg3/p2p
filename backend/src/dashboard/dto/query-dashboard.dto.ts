import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryDashboardDto {
  @ApiPropertyOptional({
    description: 'Empresa específica; ausente = todas as do usuário',
  })
  @IsOptional()
  @IsString()
  companyId?: string;
}
