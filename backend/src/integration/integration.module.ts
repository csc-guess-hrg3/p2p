import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { LinxErpService } from './linx-erp.service';
import { EmailService } from './email.service';
import { CnpjPublicService } from './cnpj-public.service';
import { ErpBackSyncService } from './erp-back-sync.service';
import { QiveClientService } from './qive-client.service';

@Module({
  providers: [
    IntegrationService,
    LinxErpService,
    EmailService,
    CnpjPublicService,
    ErpBackSyncService,
    QiveClientService,
  ],
  exports: [
    IntegrationService,
    LinxErpService,
    EmailService,
    CnpjPublicService,
    ErpBackSyncService,
    QiveClientService,
  ],
  controllers: [IntegrationController],
})
export class IntegrationModule {}
