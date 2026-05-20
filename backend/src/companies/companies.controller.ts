import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { UpdateErpConfigDto } from './dto/update-erp-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserProfile } from '../common/enums';

@ApiTags('Empresas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Empresas às quais o usuário tem acesso' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.companies.findAllForUser(user);
  }

  @Get(':id/erp-config')
  @ApiOperation({
    summary:
      'Configuração de integração com o ERP (defaults Linx + SMTP). ' +
      'Senha SMTP retorna mascarada (apenas indicação de presença).',
  })
  getErpConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.companies.getErpConfig(user, id);
  }

  @Put(':id/erp-config')
  @UseGuards(RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({
    summary: 'Atualiza a configuração de integração com o ERP (ADMIN)',
  })
  upsertErpConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateErpConfigDto,
  ) {
    return this.companies.upsertErpConfig(user, id, dto);
  }
}
