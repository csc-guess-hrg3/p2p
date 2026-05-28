import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bloqueio de conta após N tentativas seguidas de login falhas.
 *
 * Janelas crescentes para frustrar força-bruta em diferentes IPs:
 *   5 falhas  → 15 minutos
 *   10 falhas → 1 hora
 *   15 falhas → 24 horas
 *
 * Toda tentativa bem-sucedida zera o contador. Bloqueio se auto-libera
 * pelo tempo — não exige intervenção de admin.
 *
 * O contador NÃO incrementa quando o lookup do usuário falha (e-mail/CPF
 * inexistente), pra não permitir enumeração. Atacante que chuta CPF
 * aleatório recebe sempre a mesma mensagem genérica e sem rate-limit
 * extra (apenas o throttle global do endpoint protege esse caminho).
 */
@Injectable()
export class AccountLockoutService {
  // Configuração — pode ir pra SystemSetting depois se Admin precisar
  // ajustar por empresa.
  private readonly THRESHOLDS = [
    { attempts: 5, minutes: 15 },
    { attempts: 10, minutes: 60 },
    { attempts: 15, minutes: 60 * 24 },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /** Lança 401 se a conta está bloqueada agora. Não revela motivo específico. */
  async assertNotLocked(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true },
    });
    if (!user) return;
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Conta temporariamente bloqueada por excesso de tentativas. ' +
          'Tente novamente mais tarde.',
      );
    }
  }

  /** Registra uma falha. Aplica o bloqueio se atingir um dos thresholds. */
  async recordFailure(userId: string): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
        lastFailedLoginAt: new Date(),
      },
      select: { failedLoginAttempts: true },
    });
    // Aplica o threshold mais alto cujo `attempts` <= atual.
    const hit = [...this.THRESHOLDS]
      .reverse()
      .find((t) => user.failedLoginAttempts >= t.attempts);
    if (hit) {
      const lockedUntil = new Date(Date.now() + hit.minutes * 60_000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil },
      });
    }
  }

  /** Limpa contador + bloqueio após login bem-sucedido. */
  async clearOnSuccess(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }
}
