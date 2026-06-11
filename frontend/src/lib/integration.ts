import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/* Tipos dos dados de referência do ERP (views v_p2p_*). */

export interface ErpBranch {
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

export interface ErpCompraTipo {
  tipoCompra: string;
  aeDocumento: string | null;
}

export interface ErpCtbTipoOperacao {
  codigo: number;
  descricao: string;
}

export interface ErpNaturezaEntrada {
  codigo: string;
  descricao: string;
  ctbTipoOperacao: number;
}

export interface ErpPaymentCondition {
  codigo: string;
  descricao: string;
  tipo: string | null;
  parcelas: number | null;
}

export interface ErpAccount {
  codigo: string;
  nome: string;
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

export interface ErpRateioLine {
  filialCodigo: string;
  centroCustoCodigo?: string;
  porcentagem: number;
}

export interface ErpRateio {
  codigo: string;
  descricao: string;
  inativo: boolean;
  linhas: ErpRateioLine[];
  /** Só CC, escopo de equipe: CC principal (pré-selecionado no form). */
  isPrimary?: boolean;
}

/** Hooks de leitura dos dados de referência do ERP por código de empresa. */
function erpQuery<T>(company: string | undefined, resource: string) {
  return {
    queryKey: ['erp', company, resource],
    queryFn: async () =>
      (await api.get<T>(`/integration/${company}/${resource}`)).data,
    enabled: !!company,
    staleTime: 5 * 60_000,
  };
}

export function useBranches(company?: string) {
  return useQuery(erpQuery<ErpBranch[]>(company, 'branches'));
}

export function useSuppliers(company?: string) {
  return useQuery(erpQuery<ErpSupplier[]>(company, 'suppliers'));
}

export function useAccounts(company?: string) {
  return useQuery(erpQuery<ErpAccount[]>(company, 'accounts'));
}

/**
 * Templates de rateio liberados para a equipe do usuário. O backend
 * filtra automaticamente; passe `scope='all'` em telas administrativas
 * que precisam ver tudo (ex.: /admin/equipes definindo a allowlist).
 */
export function useBranchRateios(
  company?: string,
  scope: 'mine' | 'all' = 'mine',
) {
  return useQuery({
    queryKey: ['erp', company, 'branch-rateios', scope],
    queryFn: async () =>
      (
        await api.get<ErpRateio[]>(
          `/integration/${company}/branch-rateios${scope === 'all' ? '?scope=all' : ''}`,
        )
      ).data,
    enabled: !!company,
    staleTime: 5 * 60_000,
  });
}

export function useCcRateios(
  company?: string,
  scope: 'mine' | 'all' = 'mine',
) {
  return useQuery({
    queryKey: ['erp', company, 'cc-rateios', scope],
    queryFn: async () =>
      (
        await api.get<ErpRateio[]>(
          `/integration/${company}/cc-rateios${scope === 'all' ? '?scope=all' : ''}`,
        )
      ).data,
    enabled: !!company,
    staleTime: 5 * 60_000,
  });
}

/** Catálogo completo de itens da empresa. */
export function useItems(company?: string) {
  return useQuery(erpQuery<ErpItem[]>(company, 'items'));
}

/** Condições de pagamento da empresa (COND_ENT_PGTOS). */
export function usePaymentConditions(company?: string) {
  return useQuery(
    erpQuery<ErpPaymentCondition[]>(company, 'payment-conditions'),
  );
}

/** Transportadoras ativas (cadastro TRANSPORTADORAS no Linx). */
export function useTransportadoras(company?: string) {
  return useQuery(
    erpQuery<Array<{ nome: string }>>(company, 'transportadoras'),
  );
}

/** Tipos de compra Linx (COMPRAS_TIPOS) — fluxo de consumíveis. */
export function useComprasTipos(company?: string) {
  return useQuery(erpQuery<ErpCompraTipo[]>(company, 'compras-tipos'));
}

/** Tipos de operação contábil de entrada (CTB_LX_TIPO_OPERACAO). */
export function useCtbTipoOperacao(company?: string) {
  return useQuery(erpQuery<ErpCtbTipoOperacao[]>(company, 'ctb-tipo-operacao'));
}

/**
 * Naturezas de entrada filtradas por CTB. Quando `ctb` é undefined,
 * retorna todas — útil quando o fiscal ainda não escolheu o CTB.
 */
export function useNaturezasEntrada(company?: string, ctb?: number | null) {
  return useQuery({
    queryKey: ['erp', company, 'naturezas-entrada', ctb ?? null],
    queryFn: async () =>
      (
        await api.get<ErpNaturezaEntrada[]>(
          `/integration/${company}/naturezas-entrada`,
          { params: ctb != null ? { ctb } : undefined },
        )
      ).data,
    enabled: !!company,
    staleTime: 5 * 60_000,
  });
}

/** Itens vinculados a um fornecedor (SS_ITEM_FISCAL_FORNECEDOR). */
export function useSupplierItems(company?: string, supplierCode?: string) {
  return useQuery({
    queryKey: ['erp', company, 'supplier-items', supplierCode],
    queryFn: async () =>
      (
        await api.get<ErpItem[]>(
          `/integration/${company}/suppliers/${supplierCode}/items`,
        )
      ).data,
    enabled: !!company && !!supplierCode,
    staleTime: 5 * 60_000,
  });
}
