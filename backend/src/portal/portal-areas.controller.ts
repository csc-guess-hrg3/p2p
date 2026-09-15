import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ExternalOnly } from '../common/decorators/external-access.decorator';
import { areasForCategory } from './areas';

/**
 * Portal externo — lista as ÁREAS (telas) disponíveis para o usuário. Hoje o
 * representante tem a "Consulta de Clientes"; outras entram no catálogo depois.
 */
@ApiTags('Portal · Áreas (Área Externa)')
@ApiBearerAuth()
// Portal home aberto a QUALQUER usuário externo — retorna as áreas da categoria
// dele (lista vazia se ainda não tem, ex.: LOJA antes das áreas entrarem). Assim
// o login externo nunca cai em 403 aqui; o acesso aos dados é gateado por rota.
@ExternalOnly()
@Controller('portal')
export class PortalAreasController {
  @Get('areas')
  @ApiOperation({ summary: 'Áreas do portal disponíveis para o usuário.' })
  areas(@CurrentUser() user: AuthenticatedUser) {
    return areasForCategory(user.externalCategory);
  }
}
