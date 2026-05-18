import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
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
}

export class SetTeamRateiosDto {
  @ApiProperty({ type: [TeamRateioEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamRateioEntryDto)
  rateios!: TeamRateioEntryDto[];
}
