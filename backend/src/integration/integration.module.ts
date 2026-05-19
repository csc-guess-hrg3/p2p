import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { LinxErpService } from './linx-erp.service';
import { EmailService } from './email.service';

@Module({
  providers: [IntegrationService, LinxErpService, EmailService],
  exports: [IntegrationService, LinxErpService, EmailService],
  controllers: [IntegrationController],
})
export class IntegrationModule {}
