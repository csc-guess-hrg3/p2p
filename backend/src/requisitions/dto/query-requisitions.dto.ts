import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { RequisitionStatus } from '../../common/enums';

export class QueryRequisitionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ enum: Object.values(RequisitionStatus) })
  @IsOptional()
  @IsIn(Object.values(RequisitionStatus))
  status?: string;

  @ApiPropertyOptional({ description: 'Busca por número ou título' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Apenas as minhas requisições' })
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;

  @ApiPropertyOptional({
    enum: ['mine', 'team', 'all'],
    default: 'mine',
    description:
      'Escopo: mine (minhas) | team (da equipe) | all (todas, só admin).',
  })
  @IsOptional()
  @IsIn(['mine', 'team', 'all'])
  scope?: 'mine' | 'team' | 'all';

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 50;
}
