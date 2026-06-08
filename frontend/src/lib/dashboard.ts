import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type DashScope = 'mine' | 'team' | 'all';

export interface DashboardSummary {
  scope: DashScope;
  openOrders: { count: number; totalAmount: number };
  overdueOrders: {
    count: number;
    totalAmount: number;
    pctOfOpenVolume: number;
  };
  // Só vem na visão consolidada (admin/scope=all); null nos demais.
  budgetConsumption: {
    budgeted: number;
    committed: number;
    consumed: number;
    pctConsumed: number;
  } | null;
}

export interface DashboardByTeamRow {
  teamId: string | null;
  teamName: string;
  openCount: number;
  openAmount: number;
  overdueCount: number;
  overdueAmount: number;
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

export function useDashboardSummary(companyId?: string, scope?: DashScope) {
  return useQuery({
    queryKey: ['dashboard', 'summary', companyId, scope],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard', {
          params: { companyId, scope },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useOpenOrders(
  companyId?: string,
  scope?: DashScope,
  enabled = true,
) {
  return useQuery({
    queryKey: ['dashboard', 'open-orders', companyId, scope],
    queryFn: async () =>
      (
        await api.get<DashboardOrder[]>('/dashboard/open-orders', {
          params: { companyId, scope },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId && enabled,
  });
}

export function useOverdueOrders(
  companyId?: string,
  scope?: DashScope,
  enabled = true,
) {
  return useQuery({
    queryKey: ['dashboard', 'overdue-orders', companyId, scope],
    queryFn: async () =>
      (
        await api.get<DashboardOrder[]>('/dashboard/overdue-orders', {
          params: { companyId, scope },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId && enabled,
  });
}

export function useDashboardByTeam(companyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'by-team', companyId],
    queryFn: async () =>
      (
        await api.get<{ byTeam: DashboardByTeamRow[] }>('/dashboard/by-team', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId && enabled,
  });
}

export interface OrdersByMonth {
  year: number;
  month: number;
  count: number;
  total: number;
}

export interface TopSupplier {
  supplier: string;
  count: number;
  total: number;
}

export interface OrdersByStatus {
  status: string;
  count: number;
  total: number;
}

export interface MyActions {
  approvalsPending: number;
  paPending: number;
  fiscalPending: number;
  myDraftRequisitions: number;
  /** Operador: requisições próprias em SUBMITTED/IN_APPROVAL/REVISION. */
  myInApproval?: number;
  /** Comprador: requisições APROVADAS aguardando conversão em PC. */
  toConvert?: number;
}

export function useOrdersByMonth(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'orders-by-month', companyId],
    queryFn: async () =>
      (
        await api.get<OrdersByMonth[]>('/dashboard/orders-by-month', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useTopSuppliers(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'top-suppliers', companyId],
    queryFn: async () =>
      (
        await api.get<TopSupplier[]>('/dashboard/top-suppliers', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useOrdersByStatus(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'orders-by-status', companyId],
    queryFn: async () =>
      (
        await api.get<OrdersByStatus[]>('/dashboard/orders-by-status', {
          params: { companyId },
        })
      ).data,
    staleTime: STALE_MS,
    enabled: !!companyId,
  });
}

export function useMyActions(companyId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'my-actions', companyId],
    queryFn: async () =>
      (
        await api.get<MyActions>('/dashboard/my-actions', {
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
