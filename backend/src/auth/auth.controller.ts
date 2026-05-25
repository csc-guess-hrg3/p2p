import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthService, PASSWORD_POLICY } from './local-auth.service';
import { StoreAuthService } from './store-auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { LdapAuthGuard } from './guards/ldap-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './auth.types';

class LocalLoginDto {
  @ApiProperty({ description: 'Username definido pelo Admin.' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class SetupPasswordDto {
  @ApiProperty({ description: 'Token recebido por e-mail.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: PASSWORD_POLICY.description })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class StoreLookupDto {
  @ApiProperty({ description: 'CPF do vendedor (com ou sem máscara).' })
  @IsString()
  @IsNotEmpty()
  cpf!: string;
}

class StoreLoginDto {
  @ApiProperty({ description: 'CPF do vendedor (com ou sem máscara).' })
  @IsString()
  @IsNotEmpty()
  cpf!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class StoreSetupPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cpf!: string;

  @ApiProperty({ description: PASSWORD_POLICY.description })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

class DemoLoginDto {
  @ApiProperty({
    example: 'demo.admin',
    description: 'Username demo — ver /auth/demo-users.',
  })
  @IsString()
  @IsNotEmpty()
  username!: string;
}

// Atributos dos cookies de sessão. Cross-site em hosts diferentes exige
// SameSite=None+Secure; preservamos via env para HML/local sem HTTPS.
function cookieOptions(extra: { maxAgeMs: number }): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
} {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite =
    (process.env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none' | undefined) ??
    'lax';
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: extra.maxAgeMs,
  };
}

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly localAuth: LocalAuthService,
    private readonly storeAuth: StoreAuthService,
  ) {}

  /**
   * Login via Active Directory. O LdapAuthGuard autentica contra o AD;
   * em seguida o usuário é provisionado (JIT) e recebe os tokens.
   *
   * Política de cookies: setamos `p2p_token` (access, httpOnly) e
   * `p2p_refresh` (refresh, httpOnly). O body também devolve os tokens
   * por compatibilidade com clientes legados (em desuso — preferir cookies).
   *
   * Throttling: 10 tentativas por minuto por IP — defesa contra força bruta
   * no LDAP corporativo.
   */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(LdapAuthGuard)
  @ApiOperation({ summary: 'Login via Active Directory (LDAP)' })
  @ApiBody({ type: LoginDto })
  async login(
    @Req() req: { user: Record<string, unknown> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.authService.provisionFromLdap(req.user);
    const tokens = await this.authService.issueTokens(userId);
    res.cookie('p2p_token', tokens.accessToken, cookieOptions({ maxAgeMs: 8 * 60 * 60 * 1000 })); // 8h
    res.cookie('p2p_refresh', tokens.refreshToken, cookieOptions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 })); // 7d
    return tokens;
  }

  /**
   * Login local (usuários fora do AD — supervisores e vendedores).
   * `identifier` aceita e-mail corporativo ou CPF (só dígitos).
   */
  @Post('login-local')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login com username + senha (supervisores/usuários locais)',
  })
  @ApiBody({ type: LocalLoginDto })
  async loginLocal(
    @Body() dto: LocalLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.localAuth.login(dto.username, dto.password);
    const tokens = await this.authService.issueTokens(userId);
    res.cookie(
      'p2p_token',
      tokens.accessToken,
      cookieOptions({ maxAgeMs: 8 * 60 * 60 * 1000 }),
    );
    res.cookie(
      'p2p_refresh',
      tokens.refreshToken,
      cookieOptions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
    );
    return tokens;
  }

  /** Endpoint público: define/redefine senha a partir do token do e-mail. */
  @Post('setup-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Define a senha a partir do token de e-mail' })
  async setupPassword(@Body() dto: SetupPasswordDto) {
    await this.localAuth.setPassword(dto.token, dto.password);
    return { ok: true };
  }

  /**
   * Vendedor de loja: confere se o CPF está em LOJA_VENDEDORES e devolve
   * `needsSetup=true` quando ainda não há senha definida. Não loga.
   */
  @Post('store-lookup')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Pré-flight do login de loja (valida CPF)' })
  async storeLookup(@Body() dto: StoreLookupDto) {
    return this.storeAuth.lookup(dto.cpf);
  }

  /** Primeiro acesso do vendedor — cria/ativa o User com a senha. */
  @Post('store-setup-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Define a senha no primeiro acesso do vendedor' })
  async storeSetupPassword(
    @Body() dto: StoreSetupPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.storeAuth.setupPassword(dto.cpf, dto.password);
    const tokens = await this.authService.issueTokens(userId);
    res.cookie(
      'p2p_token',
      tokens.accessToken,
      cookieOptions({ maxAgeMs: 8 * 60 * 60 * 1000 }),
    );
    res.cookie(
      'p2p_refresh',
      tokens.refreshToken,
      cookieOptions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
    );
    return tokens;
  }

  /** Login do vendedor com CPF + senha. */
  @Post('store-login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login do vendedor de loja (CPF + senha)' })
  async storeLogin(
    @Body() dto: StoreLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.storeAuth.login(dto.cpf, dto.password);
    const tokens = await this.authService.issueTokens(userId);
    res.cookie(
      'p2p_token',
      tokens.accessToken,
      cookieOptions({ maxAgeMs: 8 * 60 * 60 * 1000 }),
    );
    res.cookie(
      'p2p_refresh',
      tokens.refreshToken,
      cookieOptions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 }),
    );
    return tokens;
  }

  /** Regras de complexidade (front mostra na tela de definição). */
  @Get('password-policy')
  @ApiOperation({ summary: 'Regras de complexidade da senha' })
  passwordPolicy() {
    return PASSWORD_POLICY;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renova o token de acesso' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prioriza o refresh token vindo do cookie httpOnly; cai no body como fallback.
    const refreshToken: string | undefined =
      req.cookies?.p2p_refresh ?? dto.refreshToken;
    if (!refreshToken) {
      // Mantemos o erro consistente com o service.
      return this.authService.refresh('');
    }
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie('p2p_token', tokens.accessToken, cookieOptions({ maxAgeMs: 8 * 60 * 60 * 1000 }));
    res.cookie('p2p_refresh', tokens.refreshToken, cookieOptions({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 }));
    return tokens;
  }

  /** Logout — apaga os cookies de sessão (revogação de refresh = roadmap). */
  @Post('logout')
  @ApiOperation({ summary: 'Logout — limpa cookies de sessão' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('p2p_token', { path: '/' });
    res.clearCookie('p2p_refresh', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    // canSwitchEnv não vive no JWT (pra Admin poder revogar sem forçar
    // re-login). Buscamos fresco em cada /auth/me.
    return this.authService.meWithExtras(user);
  }

  // ───────────────────────────────────────────────────────────────
  // Modo Demonstração — só responde quando DEMO_MODE_ENABLED=true
  // ───────────────────────────────────────────────────────────────

  /**
   * Lista os perfis disponíveis no modo demo (4 — admin, gestor,
   * operador, revisor). Sempre retorna `{ enabled, users }` — frontend
   * usa `enabled` para decidir se mostra o painel demo no login.
   */
  @Get('demo-users')
  @ApiOperation({ summary: 'Lista usuários do modo demonstração' })
  demoUsers() {
    return this.authService.listDemoUsers();
  }

  /**
   * Login demo — bypassa LDAP. Usa o `username` (sem senha) para localizar
   * o usuário demo correspondente. Throttle: 20/min para evitar abuso.
   */
  @Post('demo-login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login modo demonstração (sem LDAP)' })
  @ApiBody({ type: DemoLoginDto })
  async demoLogin(
    @Body() dto: DemoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.authService.loginDemo(dto.username);
    const tokens = await this.authService.issueTokens(userId);
    const secure = process.env.NODE_ENV === 'production';
    const sameSite =
      (process.env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none' | undefined) ??
      'lax';
    res.cookie('p2p_token', tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.cookie('p2p_refresh', tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return tokens;
  }
}
