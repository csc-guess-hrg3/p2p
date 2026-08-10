import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cloudflare Turnstile — CAPTCHA invisível.
 *
 * Modo de operação:
 *   - Se `TURNSTILE_SECRET_KEY` estiver definida, validamos o token
 *     contra a Cloudflare API (siteverify).
 *   - Se não estiver definida (dev/demo), passa direto — o frontend
 *     também pode pular o widget. Isso permite rodar o sistema offline
 *     e em testes sem dependência externa.
 *
 * O cliente envia o token no header `x-turnstile-token` (vindo do widget
 * renderizado no frontend) OU no body em `turnstileToken`. O serviço lê o
 * IP remoto do request pra fortalecer a verificação (Cloudflare cruza com
 * a fingerprint).
 *
 * Em produção pública na internet (HML/PROD), garantir que a env var
 * está populada com a SECRET KEY criada no painel do Cloudflare.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secretKey: string | null;

  // Endpoint oficial do Cloudflare. Mock em dev/test pelo flag abaixo.
  private readonly endpoint =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('TURNSTILE_SECRET_KEY') ?? null;
    if (!this.secretKey) {
      this.logger.warn(
        'TURNSTILE_SECRET_KEY não definida — CAPTCHA desativado (somente OK em dev/intranet).',
      );
    }
  }

  /**
   * Valida o token. Lança 401 se inválido. Aceita sem validação quando
   * o serviço está desativado (sem secret key).
   */
  async assertValid(
    token: string | undefined,
    remoteIp?: string,
  ): Promise<void> {
    if (!this.secretKey) return; // dev / sem captcha configurado
    if (!token) {
      throw new UnauthorizedException(
        'Verificação anti-bot ausente. Recarregue a página e tente novamente.',
      );
    }
    try {
      const params = new URLSearchParams();
      params.set('secret', this.secretKey);
      params.set('response', token);
      if (remoteIp) params.set('remoteip', remoteIp);

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // UA explícito pra evitar bloqueios estranhos no edge (mesmo
          // padrão da nossa integração BrasilAPI).
          'User-Agent': 'P2P-HRG3/1.0 (auth; turnstile)',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(
          `Turnstile siteverify retornou ${res.status} — bloqueando login por segurança.`,
        );
        throw new UnauthorizedException(
          'Falha na verificação anti-bot. Tente novamente.',
        );
      }
      const data = (await res.json()) as {
        success: boolean;
        'error-codes'?: string[];
      };
      if (!data.success) {
        this.logger.warn(
          `Turnstile rejeitou o token: ${(data['error-codes'] ?? []).join(', ')}`,
        );
        throw new UnauthorizedException(
          'Verificação anti-bot falhou. Recarregue a página e tente de novo.',
        );
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Falha de rede com Cloudflare → FAIL-CLOSED. Se o CAPTCHA está
      // configurado (secret presente), é porque este ambiente é exposto e
      // PRECISA da verificação anti-bot; liberar o login quando a verificação
      // não pôde ser feita abre um bypass trivial (basta o atacante induzir
      // a falha de rede pro edge da Cloudflare). Preferimos recusar e pedir
      // retry. Tradeoff: numa indisponibilidade real e prolongada da
      // Cloudflare o login degrada — nesse caso, remover a secret reativa o
      // modo aberto de forma consciente. Throttle + lockout seguem ativos.
      this.logger.error(
        `Falha ao validar Turnstile — bloqueando login (fail-closed): ${(err as Error).message}`,
      );
      throw new UnauthorizedException(
        'Não foi possível concluir a verificação anti-bot agora. Tente novamente em instantes.',
      );
    }
  }
}
