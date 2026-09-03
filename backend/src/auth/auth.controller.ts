import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthService, PASSWORD_POLICY } from './local-auth.service';
import { TurnstileService } from './turnstile.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { LdapAuthGuard } from './guards/ldap-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AllowExternal } from '../common/decorators/external-access.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import type { AuthenticatedUser, TokenPair } from './auth.types';

const ACCESS_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

class LocalLoginDto {
  @ApiProperty({ description: 'Username definido pelo Admin.' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({
    required: false,
    description: 'Token Cloudflare Turnstile (anti-bot).',
  })
  @IsOptional()
  @IsString()
  turnstileToken?: string;
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

class ForgotPasswordDto {
  @ApiProperty({ description: 'E-mail cadastrado do usuário.' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turnstileToken?: string;
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
    private readonly turnstile: TurnstileService,
  ) {}

  /**
   * Extrai o IP do cliente respeitando proxies reversos (Nginx/Cloudflare).
   * Em PROD, o gateway deve setar `x-forwarded-for` com o IP real.
   * Em dev, cai no socket direto.
   */
  private clientIp(req: Request): string {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim();
    }
    return req.ip ?? req.socket?.remoteAddress ?? '';
  }

  /**
   * Lê o token Turnstile do header (preferido) ou do body. Ambos os
   * caminhos são suportados pra evitar dor de cabeça com diferentes
   * clientes HTTP.
   */
  private turnstileToken(
    req: Request,
    body?: { turnstileToken?: string },
  ): string | undefined {
    const hdr = req.headers['x-turnstile-token'];
    if (typeof hdr === 'string' && hdr) return hdr;
    if (Array.isArray(hdr) && hdr[0]) return hdr[0];
    return body?.turnstileToken;
  }

  /**
   * Seta os cookies httpOnly de sessão e devolve a resposta de login.
   *
   * Em modo cookie (default em PROD/HML) NÃO retorna os tokens no corpo:
   * eles já viajam nos cookies httpOnly; devolvê-los no body exporia o
   * refresh token (7 dias) a JS da página/XSS, logs de rede e proxies, sem
   * benefício — o frontend em modo cookie ignora o corpo. Só o modo
   * `bearer` (legado, clientes sem cookie) recebe os tokens no body.
   * Audit M4 / task #60.
   */
  private applySession(res: Response, tokens: TokenPair) {
    res.cookie(
      'p2p_token',
      tokens.accessToken,
      cookieOptions({ maxAgeMs: ACCESS_MAX_AGE_MS }),
    );
    res.cookie(
      'p2p_refresh',
      tokens.refreshToken,
      cookieOptions({ maxAgeMs: REFRESH_MAX_AGE_MS }),
    );
    if (process.env.AUTH_MODE === 'bearer') {
      return tokens;
    }
    return { ok: true as const };
  }

  /**
   * Sair da SIMULAÇÃO DE LOGIN — volta a ser o admin real. Reachável por
   * usuário EFETIVO externo (quando o admin está simulando um representante),
   * por isso @AllowExternal.
   */
  @Post('impersonate/exit')
  @AllowExternal()
  @ApiOperation({ summary: 'Sair da simulação de login' })
  async exitImpersonation(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!user.impersonatedBy) {
      throw new BadRequestException('Você não está simulando ninguém.');
    }
    const tokens = await this.authService.exitImpersonation(
      user.impersonatedBy,
      user.id,
    );
    return this.applySession(res, tokens);
  }

  /**
   * Iniciar a SIMULAÇÃO DE LOGIN: o admin passa a "ver como" o usuário. Só
   * ADMIN; bloqueia aninhar (sair da simulação atual antes de iniciar outra).
   * A identidade efetiva vira a do alvo; a trilha registra o admin real.
   */
  @Post('impersonate/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({ summary: 'Simular login de um usuário (admin)' })
  async impersonate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user.impersonatedBy) {
      throw new ForbiddenException(
        'Saia da simulação atual antes de iniciar outra.',
      );
    }
    const tokens = await this.authService.impersonate(user.id, userId);
    return this.applySession(res, tokens);
  }

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
  @Public()
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
    return this.applySession(res, tokens);
  }

  /**
   * Login local (usuários fora do AD — supervisores e vendedores).
   * `identifier` aceita e-mail corporativo ou CPF (só dígitos).
   */
  @Post('login-local')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Login com username + senha (supervisores/usuários locais)',
  })
  @ApiBody({ type: LocalLoginDto })
  async loginLocal(
    @Body() dto: LocalLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstile.assertValid(
      this.turnstileToken(req, dto),
      this.clientIp(req),
    );
    const userId = await this.localAuth.login(dto.username, dto.password);
    const tokens = await this.authService.issueTokens(userId);
    return this.applySession(res, tokens);
  }

  /** Endpoint público: define/redefine senha a partir do token do e-mail. */
  @Post('setup-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Define a senha a partir do token de e-mail' })
  async setupPassword(@Body() dto: SetupPasswordDto) {
    await this.localAuth.setPassword(dto.token, dto.password);
    return { ok: true };
  }

  /**
   * Self-service "primeiro acesso / esqueci minha senha": o usuário informa o
   * E-MAIL; se casar com uma conta LOCAL ativa, enviamos o link (com login +
   * definição de senha). Resposta SEMPRE neutra — não revela se o e-mail existe
   * (anti-enumeração). Turnstile + rate-limit contra abuso.
   */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Envia o link de acesso para o e-mail cadastrado' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.turnstile.assertValid(
      this.turnstileToken(req, dto),
      this.clientIp(req),
    );
    await this.localAuth.requestPasswordByEmail(dto.email);
    return {
      ok: true,
      message:
        'Se o e-mail estiver cadastrado, enviamos as instruções de acesso.',
    };
  }

  /** Regras de complexidade (front mostra na tela de definição). */
  @Get('password-policy')
  @Public()
  @ApiOperation({ summary: 'Regras de complexidade da senha' })
  passwordPolicy() {
    return PASSWORD_POLICY;
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renova o token de acesso' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prioriza o refresh token vindo do cookie httpOnly; cai no body como fallback.
    const refreshToken: string | undefined =
      (req.cookies?.p2p_refresh as string | undefined) ?? dto.refreshToken;
    if (!refreshToken) {
      // Mantemos o erro consistente com o service.
      return this.authService.refresh('');
    }
    const tokens = await this.authService.refresh(refreshToken);
    return this.applySession(res, tokens);
  }

  /** Logout — apaga os cookies de sessão (revogação de refresh = roadmap). */
  @Post('logout')
  @Public()
  @ApiOperation({ summary: 'Logout — limpa cookies de sessão' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('p2p_token', { path: '/' });
    res.clearCookie('p2p_refresh', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  // Compartilhada: internos E externos leem o próprio perfil (o front decide o
  // layout pelo realm devolvido). Sem @AllowExternal, o ExternalRealmGuard
  // negaria o usuário externo aqui.
  @AllowExternal()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    // canSwitchEnv não vive no JWT (pra Admin poder revogar sem forçar
    // re-login). Buscamos fresco em cada /auth/me.
    return this.authService.meWithExtras(user);
  }
}
