import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaHealthIndicator } from './prisma.health';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Health checks da plataforma — exposto sem autenticação.
 *  - /api/health        → status agregado (DB + memória).
 *  - /api/health/live   → ping (process up).
 *  - /api/health/ready  → readiness (Prisma respondendo).
 *
 * Pensado para uso por PM2 / load balancer / Uptime checks.
 */
@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Status agregado da plataforma' })
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      // 200 MB de heap como teto; ajustar quando ficar conhecido o footprint.
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness — processo ativo' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — banco respondendo' })
  ready() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }
}
