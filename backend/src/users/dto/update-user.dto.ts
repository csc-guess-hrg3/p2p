import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
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
    description: 'ID da equipe do usuário (null remove da equipe)',
  })
  @IsOptional()
  @IsString()
  teamId?: string | null;
}
