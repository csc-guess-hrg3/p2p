import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Endpoints de leitura dos dados de referência do ERP.
 * :company aceita GUESS ou HRG3.
 */
@ApiTags('Integração ERP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integration/:company')
export class IntegrationController {
  constructor(private readonly integration: IntegrationService) {}

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
  @ApiOperation({ summary: 'Lista os templates de rateio de filial' })
  branchRateios(
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getBranchRateios(
      company,
      includeInactive !== 'true',
    );
  }

  @Get('cc-rateios')
  @ApiOperation({ summary: 'Lista os templates de rateio de centro de custo' })
  ccRateios(
    @Param('company') company: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.integration.getCostCenterRateios(
      company,
      includeInactive !== 'true',
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
