import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'usuario@corp.local',
    description: 'Login do AD (UPN ou sAMAccountName)',
  })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: '••••••••' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token emitido no login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
