import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ExternalOnly } from '../common/decorators/external-access.decorator';
import { ReportExecutorService } from './report-executor.service';
import { reportCategories } from './report-registry';

/**
 * Portal da Área Externa — relatórios do usuário externo.
 *
 * `@ExternalOnly(...)` (com as categorias que têm relatório) faz o
 * ExternalRealmGuard: NEGAR usuários internos (rota exclusiva do portal) e só
 * aceitar externos da categoria certa. O escopo por dado (só o que é do rep)
 * é aplicado no executor, resolvido do banco a cada consulta.
 */
@ApiTags('Portal · Relatórios (Área Externa)')
@ApiBearerAuth()
@ExternalOnly(...reportCategories())
@Controller('portal/reports')
export class PortalReportsController {
  constructor(private readonly executor: ReportExecutorService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os relatórios disponíveis para o usuário.' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.executor.listForUser(user);
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Roda um relatório, escopado aos dados do próprio usuário.',
  })
  run(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.executor.run(user, key);
  }
}
