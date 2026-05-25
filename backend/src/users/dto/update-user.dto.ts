import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'Permite ao usuário alternar PROD↔HML pela topbar. Admin sempre pode; flag aplica aos demais perfis.',
  })
  @IsOptional()
  @IsBoolean()
  canSwitchEnv?: boolean;
}
