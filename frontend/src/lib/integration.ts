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
  inativo: boolean;
}

export interface ErpAccount {
  codigo: string;
  nome: string;
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

export function useBranchRateios(company?: string) {
  return useQuery(erpQuery<ErpRateio[]>(company, 'branch-rateios'));
}

export function useCcRateios(company?: string) {
  return useQuery(erpQuery<ErpRateio[]>(company, 'cc-rateios'));
}
