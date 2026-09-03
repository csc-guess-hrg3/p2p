import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ExternalOnly } from '../common/decorators/external-access.decorator';
import { ExternalCategory } from '../common/enums';
import { ConsultaClientesService } from './consulta-clientes/consulta-clientes.service';

/**
 * Portal do representante — "Comissões a receber". A comissão vem por título
 * (v_p2p_rep_financeiro.COMISSAO) e o rep recebe conforme cada título é pago;
 * a view só tem títulos em aberto, então a soma é o que ele tem a receber.
 * Escopo por rep (cod_representante) resolvido no serviço.
 */
@ApiTags('Portal · Comissões')
@ApiBearerAuth()
@ExternalOnly(ExternalCategory.REPRESENTANTE)
@Controller('portal/comissoes')
export class ComissoesController {
  constructor(private readonly svc: ConsultaClientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Comissão a receber do representante (resumo + títulos em aberto).',
  })
  comissoes(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.comissoes(user);
  }
}
