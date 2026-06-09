import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Endpoints read-only do módulo Financeiro (Contas a Pagar, Provisões,
 * DDAs, IADs). Lê das views `W_CTB_…` / `W_HRG3_…` no Linx via
 * cross-DB query — nenhuma view é criada no Linx; tudo no P2P consome
 * as existentes.
 *
 * Filtros suportados em todas as listagens (params do query string):
 *   - search        : busca livre (nome/CNPJ/fatura/descrição)
 *   - emissaoFrom/To, vencimentoFrom/To : ranges YYYY-MM-DD
 *   - valorMin/Max  : range numérico
 *   - filial        : cod_filial específico
 *   - centroCusto   : rateio_centro_custo específico
 *   - limit/offset  : paginação
 */
@ApiTags('Financeiro')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('financial')
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  @Get('contas-pagar')
  @ApiOperation({
    summary:
      'Lista parcelas de contas a pagar (W_CTB_A_PAGAR_PARCELA). Aceita filtros de range.',
  })
  contasPagar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.financial.listContasPagar(user, {
      companyId: q.companyId,
      status: q.status as 'A_VENCER' | 'VENCIDO' | 'PAGO' | undefined,
      search: q.search,
      fornecedor: q.fornecedor,
      emissaoFrom: q.emissaoFrom,
      emissaoTo: q.emissaoTo,
      vencimentoFrom: q.vencimentoFrom,
      vencimentoTo: q.vencimentoTo,
      valorMin: q.valorMin,
      valorMax: q.valorMax,
      filial: q.filial,
      centroCusto: q.centroCusto,
      groupByLancamento: q.groupByLancamento === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('contas-pagar/documentos')
  @ApiOperation({
    summary:
      'Visão por documento: agrupa Contas a Pagar por LANCAMENTO (NF inteira), somando todos os ITEMs (principal + retenções).',
  })
  contasPagarDocumentos(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.financial.listContasPagarDocumentos(user, {
      companyId: q.companyId,
      status: q.status as 'A_VENCER' | 'VENCIDO' | 'PAGO' | undefined,
      search: q.search,
      fornecedor: q.fornecedor,
      emissaoFrom: q.emissaoFrom,
      emissaoTo: q.emissaoTo,
      vencimentoFrom: q.vencimentoFrom,
      vencimentoTo: q.vencimentoTo,
      valorMin: q.valorMin,
      valorMax: q.valorMax,
      filial: q.filial,
      centroCusto: q.centroCusto,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('contas-pagar/itens')
  @ApiOperation({
    summary:
      'Itens contábeis de um documento (LANCAMENTO) — drill-down da visão documento.',
  })
  contasPagarItens(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
    @Query('lancamento') lancamento: string,
  ) {
    return this.financial.getContasPagarItens(user, {
      companyId,
      lancamento: Number(lancamento),
    });
  }

  @Get('contas-pagar/parcelas')
  @ApiOperation({
    summary:
      'Parcelas individuais de um título (LANCAMENTO+ITEM). Usado pelo drill-down do modal de detalhe.',
  })
  contasPagarParcelas(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
    @Query('lancamento') lancamento: string,
    @Query('item') item: string,
  ) {
    return this.financial.getContasPagarParcelas(user, {
      companyId,
      lancamento: Number(lancamento),
      item: Number(item),
    });
  }

  @Get('iads')
  @ApiOperation({
    summary:
      'Lista adiantamentos IAD em aberto (W_CTB_AVISO_LANCAMENTO + saldo). Filtro: saldo <> 0.',
  })
  iads(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.financial.listIads(user, {
      companyId: q.companyId,
      status: q.status as 'A_VENCER' | 'VENCIDO' | 'TODOS' | undefined,
      search: q.search,
      fornecedor: q.fornecedor,
      emissaoFrom: q.emissaoFrom,
      emissaoTo: q.emissaoTo,
      vencimentoFrom: q.vencimentoFrom,
      vencimentoTo: q.vencimentoTo,
      valorMin: q.valorMin,
      valorMax: q.valorMax,
      filial: q.filial,
      centroCusto: q.centroCusto,
      semSv: q.semSv === 'true',
      comSv: q.comSv === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('provisoes')
  @ApiOperation({
    summary:
      'Lista provisões (W_HRG3_CONTAS_PAGAR_PROVISAO). Default tipo=SV (Solicitação de Verba).',
  })
  provisoes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.financial.listProvisoes(user, {
      companyId: q.companyId,
      tipo: q.tipo,
      search: q.search,
      statusAprovacao: q.statusAprovacao,
      emissaoFrom: q.emissaoFrom,
      emissaoTo: q.emissaoTo,
      vencimentoFrom: q.vencimentoFrom,
      vencimentoTo: q.vencimentoTo,
      valorMin: q.valorMin,
      valorMax: q.valorMax,
      filial: q.filial,
      centroCusto: q.centroCusto,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('branches')
  @ApiOperation({
    summary: 'Lista filiais ativas da empresa (para dropdowns).',
  })
  branches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.financial.listBranches(user, companyId);
  }

  @Get('suppliers')
  @ApiOperation({
    summary:
      'Busca fornecedores (CADASTRO_CLI_FOR). Aceita search por nome/CNPJ. Retorna até 30 por padrão.',
  })
  suppliers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.financial.searchSuppliers(user, {
      companyId,
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('currencies')
  @ApiOperation({
    summary: 'Lista moedas do Linx (dbo.MOEDAS) com flag de padrão.',
  })
  currencies(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.financial.listCurrencies(user, companyId);
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Lista centros de custo ativos (para dropdowns).' })
  costCenters(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.financial.listCostCenters(user, companyId);
  }

  @Get('sv-saldos')
  @ApiOperation({
    summary:
      'Saldo em aberto de uma ou mais SVs (W_CTB_SOLICITACAO_VERBA_SALDO). Param svs=lista separada por vírgula.',
  })
  svSaldos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
    @Query('svs') svs?: string,
  ) {
    const list = (svs ?? '').split(',').filter(Boolean);
    return this.financial.getSvSaldos(user, { companyId, svs: list });
  }

  @Get('ddas')
  @ApiOperation({
    summary: 'Lista DDAs (W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO).',
  })
  ddas(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.financial.listDdas(user, {
      companyId: q.companyId,
      status: q.status as 'PENDENTE' | 'BAIXADO' | undefined,
      search: q.search,
      recebimentoFrom: q.recebimentoFrom,
      recebimentoTo: q.recebimentoTo,
      vencimentoFrom: q.vencimentoFrom,
      vencimentoTo: q.vencimentoTo,
      valorMin: q.valorMin,
      valorMax: q.valorMax,
      groupByDuplicata: q.groupByDuplicata === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }
}
