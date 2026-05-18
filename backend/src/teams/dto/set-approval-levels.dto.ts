import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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

  @ApiProperty({ description: 'ID do usuário aprovador deste nível' })
  @IsString()
  @IsNotEmpty()
  approverId!: string;

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
