import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ExternalOnly } from '../common/decorators/external-access.decorator';
import { areasForCategory, areaCategories } from './areas';

/**
 * Portal externo — lista as ÁREAS (telas) disponíveis para o usuário. Hoje o
 * representante tem a "Consulta de Clientes"; outras entram no catálogo depois.
 */
@ApiTags('Portal · Áreas (Área Externa)')
@ApiBearerAuth()
@ExternalOnly(...areaCategories())
@Controller('portal')
export class PortalAreasController {
  @Get('areas')
  @ApiOperation({ summary: 'Áreas do portal disponíveis para o usuário.' })
  areas(@CurrentUser() user: AuthenticatedUser) {
    return areasForCategory(user.externalCategory);
  }
}
