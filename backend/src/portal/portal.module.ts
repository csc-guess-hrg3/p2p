import { Module } from '@nestjs/common';
import { PortalReportsController } from './portal-reports.controller';
import { ReportExecutorService } from './report-executor.service';
import { ReportScopeService } from './report-scope.service';

/**
 * Área Externa — portal do usuário externo (F3). Motor de relatórios:
 * catálogo + escopo (resolvido do banco) + executor (lê a view escopada).
 * PrismaService vem do PrismaModule global.
 */
@Module({
  controllers: [PortalReportsController],
  providers: [ReportExecutorService, ReportScopeService],
  exports: [ReportExecutorService],
})
export class PortalModule {}
