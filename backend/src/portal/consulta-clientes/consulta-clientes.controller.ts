import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { ExternalOnly } from '../../common/decorators/external-access.decorator';
import { ExternalCategory } from '../../common/enums';
import { ConsultaClientesService } from './consulta-clientes.service';

/**
 * Área "Consulta de Clientes" do portal do representante. Client-centric:
 * lista os clientes do rep e, para o cliente selecionado, mostra Dados 1,
 * Faturamentos (+ Pedidos da Nota) e Financeiro — tudo escopado no servidor.
 */
@ApiTags('Portal · Consulta de Clientes')
@ApiBearerAuth()
@ExternalOnly(ExternalCategory.REPRESENTANTE)
@Controller('portal/consulta-clientes')
export class ConsultaClientesController {
  constructor(private readonly svc: ConsultaClientesService) {}

  @Get('clientes')
  @ApiOperation({
    summary: 'Aba Clientes — grade dos clientes do representante.',
  })
  clientes(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.clientes(user);
  }

  @Get('clientes/:codigo/dados')
  @ApiOperation({ summary: 'Aba Dados 1 — ficha do cliente.' })
  dados1(
    @CurrentUser() user: AuthenticatedUser,
    @Param('codigo') codigo: string,
  ) {
    return this.svc.dados1(user, codigo);
  }

  @Get('clientes/:codigo/faturamentos')
  @ApiOperation({ summary: 'Aba Faturamentos — notas do cliente + totais.' })
  faturamentos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('codigo') codigo: string,
  ) {
    return this.svc.faturamentos(user, codigo);
  }

  @Get('clientes/:codigo/pedidos-nota')
  @ApiOperation({
    summary: 'Sub-grid "Pedidos da Nota" de uma nota do cliente.',
  })
  pedidosNota(
    @CurrentUser() user: AuthenticatedUser,
    @Param('codigo') codigo: string,
    @Query('nf') nf: string,
    @Query('serie') serie: string,
    @Query('filial') filial: string,
  ) {
    return this.svc.pedidosNota(user, codigo, nf, serie, filial);
  }

  @Get('clientes/:codigo/financeiro')
  @ApiOperation({
    summary: 'Aba Financeiro — posição (aging) + títulos do cliente.',
  })
  financeiro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('codigo') codigo: string,
  ) {
    return this.svc.financeiro(user, codigo);
  }
}
