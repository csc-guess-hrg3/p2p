import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { RepresentantesErpService } from './representantes-erp.service';
import { RepresentanteProvisioningService } from './representante-provisioning.service';
import { ProvisionRepresentanteDto } from './dto/provision-representante.dto';

/**
 * Admin da Área Externa — provisionamento de representantes (F1).
 * Rota interna (ADMIN); o ExternalRealmGuard libera INTERNO aqui por padrão.
 */
@ApiTags('Admin · Representantes (Área Externa)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('admin/representantes')
export class RepresentantesAdminController {
  constructor(
    private readonly repErp: RepresentantesErpService,
    private readonly provisioning: RepresentanteProvisioningService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os representantes ativos do Linx (v_p2p_representantes).',
  })
  list(@Query('empresa') empresa?: string) {
    return this.repErp.list(empresa);
  }

  @Post('provisionar')
  @ApiOperation({
    summary:
      'Cria o acesso externo do representante (login por código) e envia o link de senha.',
  })
  provisionar(@Body() dto: ProvisionRepresentanteDto) {
    return this.provisioning.provisionar(dto);
  }
}
