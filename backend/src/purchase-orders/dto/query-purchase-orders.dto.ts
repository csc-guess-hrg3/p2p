import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PurchaseOrderStatus } from '../../common/enums';

export class QueryPurchaseOrdersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ enum: Object.values(PurchaseOrderStatus) })
  @IsOptional()
  @IsIn(Object.values(PurchaseOrderStatus))
  status?: string;

  @ApiPropertyOptional({ description: 'Busca por número' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['mine', 'team', 'all'],
    default: 'mine',
    description:
      'Escopo: mine (meus, por comprador) | team (da equipe) | all (todos, só admin).',
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
