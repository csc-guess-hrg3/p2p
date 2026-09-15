import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { StoreProvisioningService } from './store-provisioning.service';
import {
  ProvisionStoreDto,
  ProvisionAllStoresDto,
  ImportProvisionStoresDto,
} from './dto/provision-store.dto';

/**
 * Admin da Área Externa — provisionamento do acesso das LOJAS (um por filial).
 * Rota interna (ADMIN); o ExternalRealmGuard libera INTERNO aqui por padrão.
 */
@ApiTags('Admin · Lojas (Área Externa)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('admin/stores')
export class StoresAdminController {
  constructor(private readonly provisioning: StoreProvisioningService) {}

  @Post('provisionar')
  @ApiOperation({
    summary:
      'Cria o acesso de UMA loja (login por filial) e envia o link de senha ao e-mail da filial.',
  })
  provisionar(@Body() dto: ProvisionStoreDto) {
    return this.provisioning.provisionarUma(dto);
  }

  @Post('provisionar-todas')
  @ApiOperation({
    summary:
      'Provisiona todas as filiais ativas COM e-mail cadastrado; retorna o relatório por filial (provisionada / sem e-mail / já existia).',
  })
  provisionarTodas(@Body() dto: ProvisionAllStoresDto) {
    return this.provisioning.provisionarTodas(dto);
  }

  @Post('importar-provisionar')
  @ApiOperation({
    summary:
      'Cola código-da-filial + e-mail: grava o e-mail em cada filial e provisiona a loja num passo. Idempotente (pula quem já tem acesso).',
  })
  importarProvisionar(@Body() dto: ImportProvisionStoresDto) {
    return this.provisioning.importarEProvisionar(dto);
  }
}
