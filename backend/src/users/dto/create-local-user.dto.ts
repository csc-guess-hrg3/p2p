import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserProfile } from '../../common/enums';

/**
 * Cadastro de usuário LOCAL (fora do AD) — supervisores e usuários
 * cadastrados manualmente. Senha é definida depois pelo próprio usuário
 * via link enviado por e-mail.
 */
export class CreateLocalUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Username definido pelo Admin (login local). 3-60 chars, alfanumérico, ponto, hífen, underscore.',
  })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ enum: Object.values(UserProfile) })
  @IsIn(Object.values(UserProfile))
  profile!: string;

  @ApiProperty({ required: false, description: 'ID do cargo (Position).' })
  @IsOptional()
  @IsString()
  positionId?: string | null;

  @ApiProperty({ type: [String], description: 'IDs das empresas.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  companyIds!: string[];
}
