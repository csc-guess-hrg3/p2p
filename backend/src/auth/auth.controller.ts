import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { LdapAuthGuard } from './guards/ldap-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './auth.types';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login via Active Directory. O LdapAuthGuard autentica contra o AD;
   * em seguida o usuário é provisionado (JIT) e recebe os tokens.
   */
  @Post('login')
  @UseGuards(LdapAuthGuard)
  @ApiOperation({ summary: 'Login via Active Directory (LDAP)' })
  @ApiBody({ type: LoginDto })
  async login(@Req() req: { user: Record<string, unknown> }) {
    const userId = await this.authService.provisionFromLdap(req.user);
    return this.authService.issueTokens(userId);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renova o token de acesso' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
