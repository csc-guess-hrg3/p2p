import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ErpSupplier } from './integration';
import { lookupCnpjPublic } from './quotations';

/**
 * Módulo Fornecedores (De-Para com o Linx). Fase 1 = leitura: lista (busca
 * server-side) + detalhe (campos do Linx + enriquecimento da Receita).
 */

/** Lista/busca fornecedores da empresa (server-side via /integration). */
export function useSupplierList(
  companyCode: string | undefined,
  search: string,
) {
  return useQuery({
    queryKey: ['suppliers-module', companyCode, search],
    enabled: !!companyCode,
    queryFn: async () =>
      (
        await api.get<ErpSupplier[]>(
          `/integration/${companyCode}/suppliers`,
          { params: search ? { search } : {} },
        )
      ).data,
  });
}

/** Detalhe de um fornecedor pelo código. Null se não achar. */
export function useSupplierDetail(
  companyCode: string | undefined,
  codigo: string | undefined,
) {
  return useQuery({
    queryKey: ['supplier-detail', companyCode, codigo],
    enabled: !!companyCode && !!codigo,
    queryFn: async () => {
      const { data } = await api.get<ErpSupplier | { found: false }>(
        `/integration/${companyCode}/suppliers/${encodeURIComponent(codigo!)}`,
      );
      return 'found' in data && data.found === false
        ? null
        : (data as ErpSupplier);
    },
  });
}

/** Dados públicos da Receita pro CNPJ do fornecedor (enriquecimento). */
export function useSupplierReceita(
  companyCode: string | undefined,
  cnpj: string | null | undefined,
) {
  const clean = (cnpj ?? '').replace(/\D/g, '');
  return useQuery({
    queryKey: ['supplier-receita', clean],
    enabled: !!companyCode && clean.length === 14,
    queryFn: async () => lookupCnpjPublic(companyCode!, clean),
    staleTime: 1000 * 60 * 60, // dados da Receita mudam pouco
  });
}
