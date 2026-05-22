import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface SupplierNoCcRow {
  empresa: string;
  codigo: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  pedidosUltimos90Dias: number;
}

export interface OverdueOrderRow {
  empresa: string;
  numero: string;
  fornecedor: string;
  filial: string;
  comprador: string | null;
  status: string;
  valor: number;
  entregaPrevista: string | null;
  diasAtraso: number | null;
  criadoEm: string;
}

export interface BudgetReportRow {
  ano: number;
  mes: number;
  filial: string;
  centroCusto: string;
  orcado: number;
  comprometido: number;
  consumido: number;
  pctConsumido: number;
  saldo: number;
}

export function useRel001(companyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['rel-001', companyId],
    queryFn: async () =>
      (
        await api.get<SupplierNoCcRow[]>(
          '/reports/rel-001-suppliers-no-cc',
          { params: { companyId } },
        )
      ).data,
    enabled: enabled && !!companyId,
  });
}

export function useRel002(companyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['rel-002', companyId],
    queryFn: async () =>
      (
        await api.get<OverdueOrderRow[]>(
          '/reports/rel-002-overdue-orders-30d',
          { params: { companyId } },
        )
      ).data,
    enabled: enabled && !!companyId,
  });
}

export function useRel003(
  companyId?: string,
  year?: number,
  month?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ['rel-003', companyId, year, month],
    queryFn: async () =>
      (
        await api.get<BudgetReportRow[]>(
          '/reports/rel-003-budget-by-branch-cc',
          { params: { companyId, year, month } },
        )
      ).data,
    enabled: enabled && !!companyId,
  });
}
