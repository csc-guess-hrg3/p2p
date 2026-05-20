import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  // Preferimos o cookie httpOnly `p2p_refresh`. Body é fallback para
  // clientes legados que ainda guardam o token em memória/localStorage.
  @ApiPropertyOptional({
    description:
      'Refresh token (opcional — preferir cookie httpOnly p2p_refresh)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
