import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { UserProfile, UserStatus } from '../../common/enums';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: Object.values(UserProfile) })
  @IsOptional()
  @IsIn(Object.values(UserProfile))
  profile?: string;

  @ApiPropertyOptional({ enum: Object.values(UserStatus) })
  @IsOptional()
  @IsIn(Object.values(UserStatus))
  status?: string;

  @ApiPropertyOptional({
    description: 'Valor máximo que o usuário pode aprovar (null = sem limite)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvalLimit?: number | null;

  @ApiPropertyOptional({
    description: 'ID da equipe do usuário (null remove da equipe)',
  })
  @IsOptional()
  @IsString()
  teamId?: string | null;
}
