import {
  Controller,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegacyImportService } from './legacy-import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Cutover de pedidos — import dos externos do Linx (Fase 1, ADMIN).
 * Idempotente: pode ser re-executado (importa só os em aberto ainda não trazidos).
 */
@ApiTags('Admin · Pedidos externos (cutover)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('admin/pedidos-externos')
export class LegacyImportController {
  constructor(private readonly legacyImport: LegacyImportService) {}

  @Post(':companyId/importar')
  @ApiOperation({
    summary:
      'Importa os pedidos EM ABERTO do Linx que nunca passaram pelo P2P (origin=EXTERNO)',
  })
  importar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
  ) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    return this.legacyImport.importExternos(companyId);
  }
}
