import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TeamRateioEntryDto {
  @ApiProperty({ description: 'ID da empresa (P2P)' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Código do template de rateio no ERP' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({
    description:
      'Só centro de custo: marca como principal (foco padrão das telas).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class SetTeamRateiosDto {
  @ApiProperty({ type: [TeamRateioEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamRateioEntryDto)
  rateios!: TeamRateioEntryDto[];
}
