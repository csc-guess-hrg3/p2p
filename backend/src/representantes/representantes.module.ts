import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RepresentantesErpService } from './representantes-erp.service';
import { RepresentanteProvisioningService } from './representante-provisioning.service';
import { RepresentantesAdminController } from './representantes-admin.controller';

/**
 * Área Externa — representantes (F1): leitura do ERP + provisionamento do
 * acesso externo. Importa AuthModule pelo LocalAuthService (link de senha).
 */
@Module({
  imports: [AuthModule],
  controllers: [RepresentantesAdminController],
  providers: [RepresentantesErpService, RepresentanteProvisioningService],
  exports: [RepresentantesErpService],
})
export class RepresentantesModule {}
