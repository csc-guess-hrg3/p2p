import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationModule } from '../integration/integration.module';
import { StoreProvisioningService } from './store-provisioning.service';
import { StoresAdminController } from './stores-admin.controller';

/**
 * Área Externa — LOJAS: provisionamento do acesso por filial (um login por
 * loja). Importa AuthModule (LocalAuthService, link de senha) e IntegrationModule
 * (getBranches, validação da filial no ERP).
 */
@Module({
  imports: [AuthModule, IntegrationModule],
  controllers: [StoresAdminController],
  providers: [StoreProvisioningService],
  exports: [StoreProvisioningService],
})
export class StoresModule {}
