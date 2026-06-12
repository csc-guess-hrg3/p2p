import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import type { ErpSupplierPublic } from './integration.types';
import { CnpjPublicService } from './cnpj-public.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from './company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserProfile } from '../common/enums';

/**
 * Endpoints de leitura dos dados de referência do ERP.
 * :company aceita GUESS ou HRG3 — CompanyAccessGuard exige que o usuário
 * pertença à empresa (isolamento cross-tenant).
 */
@ApiTags('Integração ERP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('integration/:company')
export class IntegrationController {
  constructor(
    private readonly integration: IntegrationService,
    private readonly cnpjPublic: CnpjPublicService,
  ) {}

  @Get('branches')
  @ApiOperation({ summary: 'Lista as filiais da empresa' })
  branches(
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getBranches(company, includeInactive !== 'true');
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Lista os centros de custo da empresa' })
  costCenters(
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getCostCenters(company, includeInactive !== 'true');
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'Lista/busca fornecedores da empresa' })
  suppliers(
    @Param('company') company: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getSuppliers(company, {
      onlyActive: includeInactive !== 'true',
      search,
    });
  }

  @Get('suppliers/:codigo')
  @ApiOperation({ summary: 'Detalhe de um fornecedor pelo código (Linx)' })
  async supplierByCodigo(
    @Param('company') company: string,
    @Param('codigo') codigo: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const found = await this.integration.getSupplierByCodigo(company, codigo);
    if (!found) return { found: false };
    // Dados bancários/PIX só para perfis que gerenciam fornecedores
    // (ADMIN/REVIEWER). Demais perfis veem o cadastro sem o financeiro —
    // troca de conta bancária de fornecedor é vetor de fraude P2P.
    const canSeeBankData =
      user.profile === UserProfile.ADMIN ||
      user.profile === UserProfile.REVIEWER;
    if (canSeeBankData) return found;
    const publicView: ErpSupplierPublic = {
      codigo: found.codigo,
      nome: found.nome,
      razaoSocial: found.razaoSocial,
      cnpjCpf: found.cnpjCpf,
      tipoPessoa: found.tipoPessoa,
      email: found.email,
      telefone: found.telefone,
      tipo: found.tipo,
      condicaoPgto: found.condicaoPgto,
      inativo: found.inativo,
    };
    return publicView;
  }

  @Get('supplier-by-cnpj')
  @ApiOperation({
    summary: 'Busca um fornecedor pelo CNPJ. Retorna 404 se não cadastrado.',
  })
  async supplierByCnpj(
    @Param('company') company: string,
    @Query('cnpj') cnpj: string,
  ) {
    const found = await this.integration.findSupplierByCnpj(
      company,
      cnpj ?? '',
    );
    return found ?? { found: false };
  }

  @Get('cnpj-public')
  @ApiOperation({
    summary:
      'Consulta dados públicos do CNPJ via BrasilAPI (razão social, ' +
      'endereço, CNAE etc.). Usado como fallback quando o fornecedor não ' +
      'está cadastrado no ERP — solicitante só digita o CNPJ.',
  })
  cnpjPublicLookup(@Query('cnpj') cnpj: string) {
    return this.cnpjPublic.lookup(cnpj ?? '');
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Lista o plano de contas da empresa' })
  accounts(
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getAccounts(company, includeInactive !== 'true');
  }

  @Get('items')
  @ApiOperation({ summary: 'Lista/busca itens do catálogo da empresa' })
  items(
    @Param('company') company: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getItems(company, {
      onlyActive: includeInactive !== 'true',
      search,
    });
  }

  @Get('payment-conditions')
  @ApiOperation({ summary: 'Lista as condições de pagamento da empresa' })
  paymentConditions(@Param('company') company: string) {
    return this.integration.getPaymentConditions(company);
  }

  @Get('transportadoras')
  @ApiOperation({ summary: 'Lista as transportadoras ativas da empresa' })
  transportadoras(@Param('company') company: string) {
    return this.integration.getTransportadoras(company);
  }

  @Get('suppliers/:supplierCode/items')
  @ApiOperation({ summary: 'Itens vinculados a um fornecedor' })
  supplierItems(
    @Param('company') company: string,
    @Param('supplierCode') supplierCode: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getSupplierItems(
      company,
      supplierCode,
      includeInactive !== 'true',
    );
  }

  @Get('branch-rateios')
  @ApiOperation({
    summary: 'Lista os templates de rateio de filial',
    description:
      'Por padrão devolve só os rateios liberados para a equipe do usuário. Admin sem equipe vê tudo. Use scope=all para ver todos (uso administrativo).',
  })
  branchRateios(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('scope') scope?: 'all' | 'mine',
  ) {
    if (scope === 'all' && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem usar scope=all.',
      );
    }
    return this.integration.getBranchRateios(
      company,
      includeInactive !== 'true',
      scope === 'all' ? null : user.teamId,
    );
  }

  @Get('cc-rateios')
  @ApiOperation({
    summary: 'Lista os templates de rateio de centro de custo',
    description:
      'Por padrão devolve só os rateios liberados para a equipe do usuário. Admin sem equipe vê tudo. Use scope=all para ver todos.',
  })
  ccRateios(
    @CurrentUser() user: AuthenticatedUser,
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('scope') scope?: 'all' | 'mine',
  ) {
    if (scope === 'all' && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem usar scope=all.',
      );
    }
    return this.integration.getCostCenterRateios(
      company,
      includeInactive !== 'true',
      scope === 'all' ? null : user.teamId,
    );
  }

  @Get('compras-tipos')
  @ApiOperation({ summary: 'Tipos de compra do Linx (consumíveis)' })
  comprasTipos(@Param('company') company: string) {
    return this.integration.getComprasTipos(company);
  }

  @Get('ctb-tipo-operacao')
  @ApiOperation({ summary: 'Tipos de operação contábil de entrada' })
  ctbTipoOperacao(@Param('company') company: string) {
    return this.integration.getCtbTipoOperacao(company);
  }

  @Get('naturezas-entrada')
  @ApiOperation({ summary: 'Naturezas de entrada (opcional: filtrar por CTB)' })
  naturezasEntrada(
    @Param('company') company: string,
    @Query('ctb') ctb?: string,
  ) {
    return this.integration.getNaturezasEntrada(
      company,
      ctb ? Number(ctb) : undefined,
    );
  }
}
