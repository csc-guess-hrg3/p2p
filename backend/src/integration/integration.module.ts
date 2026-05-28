import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { LinxErpService } from './linx-erp.service';
import { EmailService } from './email.service';
import { CnpjPublicService } from './cnpj-public.service';
import { ErpBackSyncService } from './erp-back-sync.service';

@Module({
  providers: [
    IntegrationService,
    LinxErpService,
    EmailService,
    CnpjPublicService,
    ErpBackSyncService,
  ],
  exports: [IntegrationService, LinxErpService, EmailService, CnpjPublicService],
  controllers: [IntegrationController],
})
export class IntegrationModule {}
