import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health indicator que valida a conectividade do P2P_DB.
 * Faz um SELECT 1 mínimo via Prisma e mede a latência.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1 AS ok`;
      const durationMs = Date.now() - start;
      return this.getStatus(key, true, { durationMs });
    } catch (err) {
      throw new HealthCheckError(
        'Prisma health check failed',
        this.getStatus(key, false, {
          message: (err as Error).message,
          durationMs: Date.now() - start,
        }),
      );
    }
  }
}
