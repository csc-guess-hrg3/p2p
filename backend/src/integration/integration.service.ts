import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompanyCode,
  ErpAccount,
  ErpBranch,
  ErpCompraTipo,
  ErpCostCenter,
  ErpCtbTipoOperacao,
  ErpItem,
  ErpNaturezaEntrada,
  ErpPaymentCondition,
  ErpRateio,
  ErpSupplier,
} from './integration.types';

/**
 * Camada de integração com o ERP (Linx).
 * Lê os dados de referência das views v_p2p_* (cross-database, mesmo servidor).
 * O ERP é fonte de verdade desses dados — o P2P apenas consulta.
 *
 * As escritas (envio de OC/SV ao ERP) serão adicionadas aqui posteriormente.
 */
@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Valida e normaliza o código da empresa. */
  private assertCompany(company: string): CompanyCode {
    const c = company?.toUpperCase();
    if (c !== 'GUESS' && c !== 'HERING') {
      throw new BadRequestException(
        `Empresa inválida: "${company}". Use GUESS ou HERING.`,
      );
    }
    return c;
  }

  private activeFilter(onlyActive: boolean): Prisma.Sql {
    return onlyActive ? Prisma.sql`AND inativo = 0` : Prisma.empty;
  }

  /** Filiais da empresa. */
  async getBranches(
    company: string,
    onlyActive = true,
  ): Promise<ErpBranch[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpBranch[]>`
      SELECT codigo, nome, razao_social AS razaoSocial, cnpj, ie,
             logradouro, numero, bairro, cidade, uf, cep, tipo, inativo
      FROM dbo.v_p2p_branches
      WHERE empresa = ${c} ${this.activeFilter(onlyActive)}
      ORDER BY nome`;
  }

  /** Centros de custo da empresa. */
  async getCostCenters(
    company: string,
    onlyActive = true,
  ): Promise<ErpCostCenter[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpCostCenter[]>`
      SELECT codigo, nome, inativo
      FROM dbo.v_p2p_cost_centers
      WHERE empresa = ${c} ${this.activeFilter(onlyActive)}
      ORDER BY nome`;
  }

  /**
   * Fornecedores da empresa. Busca por nome, razão social ou CNPJ/CPF —
   * o CNPJ casa com ou sem máscara (pontos, barra e traço são ignorados).
   */
  async getSuppliers(
    company: string,
    options: { onlyActive?: boolean; search?: string } = {},
  ): Promise<ErpSupplier[]> {
    const c = this.assertCompany(company);
    const { onlyActive = true, search } = options;
    let searchFilter = Prisma.empty;
    if (search) {
      const term = `%${search}%`;
      const digits = search.replace(/\D/g, '');
      if (digits) {
        const dterm = `%${digits}%`;
        searchFilter = Prisma.sql`AND (nome LIKE ${term} OR razao_social LIKE ${term}
          OR REPLACE(REPLACE(REPLACE(cnpj_cpf, '.', ''), '/', ''), '-', '') LIKE ${dterm})`;
      } else {
        searchFilter = Prisma.sql`AND (nome LIKE ${term} OR razao_social LIKE ${term})`;
      }
    }
    return this.prisma.$queryRaw<ErpSupplier[]>`
      SELECT codigo, nome, razao_social AS razaoSocial, cnpj_cpf AS cnpjCpf,
             tipo_pessoa AS tipoPessoa, email, telefone, tipo,
             condicao_pgto AS condicaoPgto, banco, agencia, conta,
             chave_pix AS chavePix, inativo
      FROM dbo.v_p2p_suppliers
      WHERE empresa = ${c} ${this.activeFilter(onlyActive)} ${searchFilter}
      ORDER BY nome`;
  }

  /** Plano de contas da empresa. */
  async getAccounts(
    company: string,
    onlyActive = true,
  ): Promise<ErpAccount[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpAccount[]>`
      SELECT codigo, nome, tipo_conta AS tipoConta,
             controla_orcamento AS controlaOrcamento, inativo
      FROM dbo.v_p2p_accounts
      WHERE empresa = ${c} ${this.activeFilter(onlyActive)}
      ORDER BY codigo`;
  }

  /** Catálogo de itens da empresa. Aceita busca por descrição. */
  async getItems(
    company: string,
    options: { onlyActive?: boolean; search?: string } = {},
  ): Promise<ErpItem[]> {
    const c = this.assertCompany(company);
    const { onlyActive = true, search } = options;
    const searchFilter = search
      ? Prisma.sql`AND descricao LIKE ${'%' + search + '%'}`
      : Prisma.empty;
    return this.prisma.$queryRaw<ErpItem[]>`
      SELECT codigo, descricao, unidade,
             conta_contabil_padrao AS contaContabilPadrao,
             rateio_filial_padrao AS rateioFilialPadrao,
             rateio_cc_padrao AS rateioCcPadrao,
             grupo, inativo
      FROM dbo.v_p2p_items
      WHERE empresa = ${c} ${this.activeFilter(onlyActive)} ${searchFilter}
      ORDER BY descricao`;
  }

  /** Condições de pagamento da empresa (COND_ENT_PGTOS). */
  async getPaymentConditions(
    company: string,
  ): Promise<ErpPaymentCondition[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpPaymentCondition[]>`
      SELECT codigo, descricao, tipo, parcelas
      FROM dbo.v_p2p_payment_conditions
      WHERE empresa = ${c}
      ORDER BY codigo`;
  }

  async findPaymentCondition(
    company: string,
    codigo: string,
  ): Promise<ErpPaymentCondition | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<ErpPaymentCondition[]>`
      SELECT codigo, descricao, tipo, parcelas
      FROM dbo.v_p2p_payment_conditions
      WHERE empresa = ${c} AND codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  /**
   * Itens vinculados a um fornecedor (SS_ITEM_FISCAL_FORNECEDOR).
   * É o conjunto que o usuário escolhe ao montar uma requisição.
   */
  async getSupplierItems(
    company: string,
    supplierCode: string,
    onlyActive = true,
  ): Promise<ErpItem[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpItem[]>`
      SELECT codigo, descricao, unidade,
             conta_contabil_padrao AS contaContabilPadrao,
             rateio_filial_padrao AS rateioFilialPadrao,
             rateio_cc_padrao AS rateioCcPadrao,
             grupo, inativo
      FROM dbo.v_p2p_supplier_items
      WHERE empresa = ${c} AND fornecedor = ${supplierCode}
        ${this.activeFilter(onlyActive)}
      ORDER BY descricao`;
  }

  /** Templates de rateio de filial, com as linhas agrupadas. */
  async getBranchRateios(
    company: string,
    onlyActive = true,
  ): Promise<ErpRateio[]> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      {
        codigo: string;
        descricao: string;
        inativo: boolean;
        filialCodigo: string;
        porcentagem: number;
      }[]
    >`
      SELECT rateio_codigo AS codigo, rateio_descricao AS descricao,
             rateio_inativo AS inativo, filial_codigo AS filialCodigo,
             porcentagem
      FROM dbo.v_p2p_branch_rateios
      WHERE empresa = ${c}
        ${onlyActive ? Prisma.sql`AND rateio_inativo = 0` : Prisma.empty}
      ORDER BY rateio_descricao`;
    return this.groupRateios(rows, false);
  }

  /** Templates de rateio de centro de custo, com as linhas agrupadas. */
  async getCostCenterRateios(
    company: string,
    onlyActive = true,
  ): Promise<ErpRateio[]> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      {
        codigo: string;
        descricao: string;
        inativo: boolean;
        centroCustoCodigo: string;
        filialCodigo: string;
        porcentagem: number;
      }[]
    >`
      SELECT rateio_codigo AS codigo, rateio_descricao AS descricao,
             rateio_inativo AS inativo, centro_custo_codigo AS centroCustoCodigo,
             filial_codigo AS filialCodigo, porcentagem
      FROM dbo.v_p2p_cc_rateios
      WHERE empresa = ${c}
        ${onlyActive ? Prisma.sql`AND rateio_inativo = 0` : Prisma.empty}
      ORDER BY rateio_descricao`;
    return this.groupRateios(rows, true);
  }

  // ----------------------------------------------------------------
  // Catálogos Linx para gravação do Pedido de Compra
  // ----------------------------------------------------------------

  /** Tipos de compra disponíveis (fluxo de consumíveis). */
  async getComprasTipos(company: string): Promise<ErpCompraTipo[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpCompraTipo[]>`
      SELECT tipo_compra AS tipoCompra, ae_documento AS aeDocumento
      FROM dbo.v_p2p_compras_tipos
      WHERE empresa = ${c}
      ORDER BY tipo_compra`;
  }

  /** Tipos de operação contábil de ENTRADA ativos. */
  async getCtbTipoOperacao(company: string): Promise<ErpCtbTipoOperacao[]> {
    const c = this.assertCompany(company);
    return this.prisma.$queryRaw<ErpCtbTipoOperacao[]>`
      SELECT codigo, descricao
      FROM dbo.v_p2p_ctb_tipo_operacao
      WHERE empresa = ${c}
      ORDER BY descricao`;
  }

  /**
   * Naturezas de entrada. Quando `ctb` é informado, filtra apenas as
   * naturezas vinculadas àquele tipo de operação (cascade na tela do fiscal).
   */
  async getNaturezasEntrada(
    company: string,
    ctb?: number,
  ): Promise<ErpNaturezaEntrada[]> {
    const c = this.assertCompany(company);
    const ctbFilter = ctb != null
      ? Prisma.sql`AND ctb_tipo_operacao = ${ctb}`
      : Prisma.empty;
    return this.prisma.$queryRaw<ErpNaturezaEntrada[]>`
      SELECT codigo, descricao, ctb_tipo_operacao AS ctbTipoOperacao
      FROM dbo.v_p2p_naturezas_entrada
      WHERE empresa = ${c} ${ctbFilter}
      ORDER BY codigo`;
  }

  // ----------------------------------------------------------------
  // Lookups individuais — validação de códigos do ERP ao criar documentos
  // ----------------------------------------------------------------

  async findBranch(
    company: string,
    codigo: string,
  ): Promise<ErpBranch | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<ErpBranch[]>`
      SELECT codigo, nome, razao_social AS razaoSocial, cnpj, ie,
             logradouro, numero, bairro, cidade, uf, cep, tipo, inativo
      FROM dbo.v_p2p_branches
      WHERE empresa = ${c} AND codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  async findSupplier(
    company: string,
    codigo: string,
  ): Promise<ErpSupplier | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<ErpSupplier[]>`
      SELECT codigo, nome, razao_social AS razaoSocial, cnpj_cpf AS cnpjCpf,
             tipo_pessoa AS tipoPessoa, email, telefone, tipo,
             condicao_pgto AS condicaoPgto, banco, agencia, conta,
             chave_pix AS chavePix, inativo
      FROM dbo.v_p2p_suppliers
      WHERE empresa = ${c} AND codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  async findItem(company: string, codigo: string): Promise<ErpItem | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<ErpItem[]>`
      SELECT codigo, descricao, unidade,
             conta_contabil_padrao AS contaContabilPadrao,
             rateio_filial_padrao AS rateioFilialPadrao,
             rateio_cc_padrao AS rateioCcPadrao, grupo, inativo
      FROM dbo.v_p2p_items
      WHERE empresa = ${c} AND codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  async findAccount(
    company: string,
    codigo: string,
  ): Promise<ErpAccount | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<ErpAccount[]>`
      SELECT codigo, nome, tipo_conta AS tipoConta,
             controla_orcamento AS controlaOrcamento, inativo
      FROM dbo.v_p2p_accounts
      WHERE empresa = ${c} AND codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  /** Cabeçalho de um template de rateio de filial (código + descrição). */
  async findBranchRateio(
    company: string,
    codigo: string,
  ): Promise<{ codigo: string; descricao: string } | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      { codigo: string; descricao: string }[]
    >`
      SELECT TOP 1 rateio_codigo AS codigo, rateio_descricao AS descricao
      FROM dbo.v_p2p_branch_rateios
      WHERE empresa = ${c} AND rateio_codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  /** Cabeçalho de um template de rateio de centro de custo. */
  async findCostCenterRateio(
    company: string,
    codigo: string,
  ): Promise<{ codigo: string; descricao: string } | null> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      { codigo: string; descricao: string }[]
    >`
      SELECT TOP 1 rateio_codigo AS codigo, rateio_descricao AS descricao
      FROM dbo.v_p2p_cc_rateios
      WHERE empresa = ${c} AND rateio_codigo = ${codigo}`;
    return rows[0] ?? null;
  }

  /** Linhas de um template de rateio de filial (filial + %). */
  async getBranchRateioLines(
    company: string,
    codigo: string,
  ): Promise<{ filialCodigo: string; porcentagem: number }[]> {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      { filialCodigo: string; porcentagem: number }[]
    >`
      SELECT filial_codigo AS filialCodigo, porcentagem
      FROM dbo.v_p2p_branch_rateios
      WHERE empresa = ${c} AND rateio_codigo = ${codigo}`;
    return rows.map((r) => ({
      filialCodigo: r.filialCodigo,
      porcentagem: Number(r.porcentagem),
    }));
  }

  /** Linhas de um template de rateio de centro de custo (CC + filial + %). */
  async getCostCenterRateioLines(
    company: string,
    codigo: string,
  ): Promise<
    {
      centroCustoCodigo: string;
      filialCodigo: string | null;
      porcentagem: number;
    }[]
  > {
    const c = this.assertCompany(company);
    const rows = await this.prisma.$queryRaw<
      {
        centroCustoCodigo: string;
        filialCodigo: string | null;
        porcentagem: number;
      }[]
    >`
      SELECT centro_custo_codigo AS centroCustoCodigo,
             filial_codigo AS filialCodigo, porcentagem
      FROM dbo.v_p2p_cc_rateios
      WHERE empresa = ${c} AND rateio_codigo = ${codigo}`;
    return rows.map((r) => ({
      centroCustoCodigo: r.centroCustoCodigo,
      filialCodigo: r.filialCodigo,
      porcentagem: Number(r.porcentagem),
    }));
  }

  // ----------------------------------------------------------------
  // Escritas no ERP — usadas pela resolução de pendências fiscais.
  // O nome do banco vem de Company.erpDbName (valor controlado).
  // ----------------------------------------------------------------

  private assertDbName(erpDbName: string): string {
    if (erpDbName !== 'GUESS_PRODUCAO' && erpDbName !== 'DB_HRG3') {
      throw new BadRequestException(`Banco ERP inválido: ${erpDbName}`);
    }
    return erpDbName;
  }

  /** Cria o vínculo item-fornecedor no Linx (SS_ITEM_FISCAL_FORNECEDOR). */
  async linkSupplierItem(
    erpDbName: string,
    supplierCode: string,
    itemCode: string,
  ): Promise<void> {
    const db = this.assertDbName(erpDbName);
    const exists = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*) AS n
      FROM ${Prisma.raw(db)}.dbo.SS_ITEM_FISCAL_FORNECEDOR
      WHERE CLIFOR = ${supplierCode} AND CODIGO_ITEM = ${itemCode}`);
    if (Number(exists[0].n) > 0) {
      this.logger.warn(
        `Vínculo já existente: ${supplierCode}/${itemCode} (${db})`,
      );
      return;
    }
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${Prisma.raw(db)}.dbo.SS_ITEM_FISCAL_FORNECEDOR
        (CLIFOR, CODIGO_ITEM, VALOR_UNITARIO)
      VALUES (${supplierCode}, ${itemCode}, 0)`);
    this.logger.log(`Vínculo gravado no Linx: ${supplierCode}/${itemCode}`);
  }

  /** Agrupa linhas de rateio (uma linha por destino) em templates. */
  private groupRateios(
    rows: Array<{
      codigo: string;
      descricao: string;
      inativo: boolean;
      filialCodigo: string;
      centroCustoCodigo?: string;
      porcentagem: number;
    }>,
    includeCostCenter: boolean,
  ): ErpRateio[] {
    const map = new Map<string, ErpRateio>();
    for (const r of rows) {
      let rateio = map.get(r.codigo);
      if (!rateio) {
        rateio = {
          codigo: r.codigo,
          descricao: r.descricao,
          inativo: r.inativo,
          linhas: [],
        };
        map.set(r.codigo, rateio);
      }
      rateio.linhas.push({
        filialCodigo: r.filialCodigo,
        ...(includeCostCenter
          ? { centroCustoCodigo: r.centroCustoCodigo }
          : {}),
        porcentagem: Number(r.porcentagem),
      });
    }
    return [...map.values()];
  }
}
