import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryDashboardDto {
  @ApiPropertyOptional({
    description: 'Empresa específica; ausente = todas as do usuário',
  })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({
    enum: ['mine', 'team', 'all'],
    description:
      'Escopo dos KPIs: mine (meus) | team (da equipe) | all (empresa). ' +
      'O backend rebaixa pelo papel: operador só mine; gestor mine/team; ' +
      'admin mine/team/all.',
  })
  @IsOptional()
  @IsIn(['mine', 'team', 'all'])
  scope?: 'mine' | 'team' | 'all';
}
