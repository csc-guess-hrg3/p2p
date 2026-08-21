import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { LinxErpService } from './linx-erp.service';
import { EmailService } from './email.service';
import { CnpjPublicService } from './cnpj-public.service';
import { ErpBackSyncService } from './erp-back-sync.service';
import { QiveClientService } from './qive-client.service';
import { CompanyAccessGuard } from './company-access.guard';
import { LegacyImportService } from './legacy-import.service';
import { LegacyImportController } from './legacy-import.controller';

@Module({
  providers: [
    IntegrationService,
    LinxErpService,
    EmailService,
    CnpjPublicService,
    ErpBackSyncService,
    QiveClientService,
    CompanyAccessGuard,
    LegacyImportService,
  ],
  exports: [
    IntegrationService,
    LinxErpService,
    EmailService,
    CnpjPublicService,
    ErpBackSyncService,
    QiveClientService,
    LegacyImportService,
  ],
  controllers: [IntegrationController, LegacyImportController],
})
export class IntegrationModule {}
