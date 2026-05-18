/**
 * Tipos dos dados de referência lidos das views v_p2p_* do ERP.
 * O ERP é fonte de verdade — estes dados NÃO são persistidos no P2P.
 */

export type CompanyCode = 'GUESS' | 'HERING';

export interface ErpBranch {
  codigo: string;
  nome: string;
  cnpj: string | null;
  tipo: string | null;
}

export interface ErpCostCenter {
  codigo: string;
  nome: string;
  inativo: boolean;
}

export interface ErpSupplier {
  codigo: string;
  nome: string;
  razaoSocial: string | null;
  cnpjCpf: string | null;
  tipoPessoa: 'PJ' | 'PF' | null;
  email: string | null;
  telefone: string | null;
  tipo: string | null;
  condicaoPgto: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chavePix: string | null;
  inativo: boolean;
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
}
