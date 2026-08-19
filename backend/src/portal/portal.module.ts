import { Module } from '@nestjs/common';
import { PortalAreasController } from './portal-areas.controller';
import { ConsultaClientesController } from './consulta-clientes/consulta-clientes.controller';
import { ConsultaClientesService } from './consulta-clientes/consulta-clientes.service';
import { ReportScopeService } from './report-scope.service';

/**
 * Área Externa — portal do usuário externo. Container de ÁREAS (telas). Hoje:
 * "Consulta de Clientes" (client-centric). O escopo por dado (só o que é do
 * rep) vive nos serviços, resolvido do banco a cada consulta. PrismaService
 * vem do PrismaModule global.
 */
@Module({
  controllers: [PortalAreasController, ConsultaClientesController],
  providers: [ReportScopeService, ConsultaClientesService],
})
export class PortalModule {}
