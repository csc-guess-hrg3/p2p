import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health indicator do ERP: prova que as views de integração `v_p2p_*` existem
 * e que o cross-database até o Linx responde. Sem isso, um deploy pode subir
 * "saudável" (P2P_DB no ar) mas com as views/Linx inacessíveis e falhar toda
 * integração só em runtime.
 *
 * Fica num endpoint DEDICADO (/api/health/erp) — de propósito FORA do /ready,
 * pra um blip transitório do Linx não marcar o app inteiro como indisponível.
 * Uso: smoke de deploy (confirmar que as views foram aplicadas) + monitoramento.
 */
@Injectable()
export class ErpHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      // Query mínima: existência da view + cross-db vivo. Sem interpolação.
      await this.prisma.$queryRawUnsafe(
        'SELECT TOP 1 1 AS ok FROM dbo.v_p2p_branches',
      );
      return this.getStatus(key, true, { durationMs: Date.now() - start });
    } catch (err) {
      throw new HealthCheckError(
        'ERP health check failed',
        this.getStatus(key, false, {
          message: (err as Error).message,
          durationMs: Date.now() - start,
        }),
      );
    }
  }
}
