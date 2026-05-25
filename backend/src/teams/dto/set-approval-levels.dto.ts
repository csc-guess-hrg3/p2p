import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApprovalLevelEntryDto {
  @ApiProperty({ description: 'Ordem do nível na cadeia (1 = primeiro)' })
  @IsInt()
  @Min(1)
  level!: number;

  @ApiProperty({ example: 'Coordenador' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'ID do usuário aprovador (fixo). Mutuamente exclusivo com requiredPositionId.',
  })
  @IsOptional()
  @IsString()
  approverId?: string | null;

  @ApiPropertyOptional({
    description:
      'ID do cargo aprovador (dinâmico). Qualquer usuário com este cargo aprova.',
  })
  @IsOptional()
  @IsString()
  requiredPositionId?: string | null;

  @ApiPropertyOptional({
    description:
      'Quando true, restringe aprovadores aos usuários atribuídos à filial da requisição. Só faz sentido com requiredPositionId.',
  })
  @IsOptional()
  @IsBoolean()
  scopeByBranch?: boolean;

  @ApiPropertyOptional({
    description: 'Alçada do nível (valor máximo); null = sem limite',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number | null;
}

export class SetApprovalLevelsDto {
  @ApiProperty({ type: [ApprovalLevelEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalLevelEntryDto)
  levels!: ApprovalLevelEntryDto[];
}
