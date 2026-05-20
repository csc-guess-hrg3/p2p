import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface DashboardSummary {
  openOrders: { count: number; totalAmount: number };
  overdueOrders: {
    count: number;
    totalAmount: number;
    pctOfOpenVolume: number;
  };
  budgetConsumption: {
    budgeted: number;
    committed: number;
    consumed: number;
    pctConsumed: number;
  };
}

export interface DashboardOrder {
  id: string;
  number: string;
  supplierName: string;
  branchName: string;
  status: string;
  totalAmount: string;
  expectedDelivery: string | null;
  createdAt: string;
  buyer?: { id: string; name: string };
}

export interface BudgetByCostCenter {
  branchErpCode: string;
  costCenterErpCode: string;
  budgeted: number;
  committed: number;
  consumed: number;
  pctConsumed: number;
}

export interface BudgetDrilldown {
  period: { year: number; month: number };
  totals: DashboardSummary['budgetConsumption'];
  byCostCenter: BudgetByCostCenter[];
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Refresh a cada 5 minutos (PRD § 16) — não polui o servidor mas mantém
 * os KPIs razoavelmente atualizados na tela.
 */
const STALE_MS = 5 * 60_000;

export function useDashboardSummary(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', companyId],
    queryFn: async () =>
      (await api.get<DashboardSummary>('/dashboard', { params: { companyId } }))
        .data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useOpenOrders(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'open-orders', companyId],
    queryFn: async () =>
      (
        await api.get<DashboardOrder[]>('/dashboard/open-orders', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useOverdueOrders(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'overdue-orders', companyId],
    queryFn: async () =>
      (
        await api.get<DashboardOrder[]>('/dashboard/overdue-orders', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useBudgetConsumption(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'budget', companyId],
    queryFn: async () =>
      (
        await api.get<BudgetDrilldown>('/dashboard/budget-consumption', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}
