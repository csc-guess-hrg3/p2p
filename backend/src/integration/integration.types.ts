/**
 * Tipos dos dados de referência lidos das views v_p2p_* do ERP.
 * O ERP é fonte de verdade — estes dados NÃO são persistidos no P2P.
 */

export type CompanyCode = 'GUESS' | 'HRG3';

export interface ErpBranch {
  codigo: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  ie: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  tipo: string | null;
  inativo: boolean;
}

export interface ErpCostCenter {
  codigo: string;
  nome: string;
  inativo: boolean;
}

/**
 * Campos públicos de um fornecedor — SEM dados bancários. É o que sai na
 * listagem/autocomplete e nos lookups do fluxo de requisição, acessíveis a
 * qualquer perfil da empresa.
 */
export interface ErpSupplierPublic {
  codigo: string;
  nome: string;
  razaoSocial: string | null;
  cnpjCpf: string | null;
  tipoPessoa: 'PJ' | 'PF' | null;
  email: string | null;
  telefone: string | null;
  tipo: string | null;
  condicaoPgto: string | null;
  inativo: boolean;
}

/**
 * Fornecedor completo — inclui dados bancários e chave PIX. Esses campos só
 * podem sair no endpoint de DETALHE com checagem de perfil (ADMIN/REVIEWER);
 * nunca na listagem/autocomplete. Troca de dados bancários de fornecedor é
 * o vetor clássico de fraude em procure-to-pay — quanto menos gente vê,
 * menor a superfície.
 */
export interface ErpSupplier extends ErpSupplierPublic {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chavePix: string | null;
}

export interface ErpAccount {
  codigo: string;
  nome: string;
  tipoConta: string | null;
  controlaOrcamento: boolean;
  inativo: boolean;
}

export interface ErpItem {
  codigo: string;
  descricao: string;
  unidade: string | null;
  contaContabilPadrao: string | null;
  rateioFilialPadrao: string | null;
  rateioCcPadrao: string | null;
  grupo: string | null;
  inativo: boolean;
}

/** Condição de pagamento (COND_ENT_PGTOS). */
export interface ErpPaymentCondition {
  codigo: string;
  descricao: string;
  tipo: string | null;
  parcelas: number | null;
}

/** Tipo de compra do Linx (COMPRAS_TIPOS) — fluxo de consumíveis. */
export interface ErpCompraTipo {
  tipoCompra: string;
  aeDocumento: string | null;
}

/** Tipo de operação contábil de entrada (CTB_LX_TIPO_OPERACAO). */
export interface ErpCtbTipoOperacao {
  codigo: number;
  descricao: string;
}

/** Natureza de entrada (NATUREZAS_ENTRADAS). Pertence a um CTB. */
export interface ErpNaturezaEntrada {
  codigo: string;
  descricao: string;
  ctbTipoOperacao: number;
}

/** Uma linha de um template de rateio (destino + percentual). */
export interface ErpRateioLine {
  filialCodigo: string;
  centroCustoCodigo?: string;
  porcentagem: number;
}

/** Template de rateio com suas linhas agrupadas. */
export interface ErpRateio {
  codigo: string;
  descricao: string;
  inativo: boolean;
  linhas: ErpRateioLine[];
  /** Só CC, escopo de equipe: é o CC principal da equipe (foco padrão). */
  isPrimary?: boolean;
}
