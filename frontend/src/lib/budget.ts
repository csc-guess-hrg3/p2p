import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface BudgetConfig {
  companyId: string;
  enabled: boolean;
  policy: 'INFORMATIVE' | 'BLOCKING';
}

export interface BudgetEntry {
  id: string;
  companyId: string;
  branchErpCode: string;
  costCenterErpCode: string;
  year: number;
  month: number;
  amountBudgeted: string;
}

export interface BudgetCell {
  branchErpCode: string;
  costCenterErpCode: string;
  year: number;
  month: number;
  budgeted: number;
  committed: number;
  available: number;
  exceeded: boolean;
}

export interface BudgetConsumption {
  cells: BudgetCell[];
  totals: { budgeted: number; committed: number; available: number };
}

export function useBudgetConfig(companyId?: string) {
  return useQuery({
    queryKey: ['budget', companyId, 'config'],
    queryFn: async () =>
      (await api.get<BudgetConfig>(`/budget/${companyId}/config`)).data,
    enabled: !!companyId,
  });
}

export function useSetBudgetConfig(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<BudgetConfig, 'enabled' | 'policy'>>) =>
      (await api.put<BudgetConfig>(`/budget/${companyId}/config`, patch)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['budget', companyId, 'config'] }),
  });
}

export function useBudgetEntries(companyId?: string, year?: number) {
  return useQuery({
    queryKey: ['budget', companyId, 'entries', year],
    queryFn: async () =>
      (
        await api.get<BudgetEntry[]>(`/budget/${companyId}/entries`, {
          params: year ? { year } : {},
        })
      ).data,
    enabled: !!companyId,
  });
}

export interface UpsertBudgetEntryPayload {
  branchErpCode: string;
  costCenterErpCode: string;
  year: number;
  month: number;
  amountBudgeted: number;
}

export function useUpsertBudgetEntry(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertBudgetEntryPayload) =>
      (await api.post<BudgetEntry>(`/budget/${companyId}/entries`, payload))
        .data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['budget', companyId] }),
  });
}

export function useBudgetConsumption(companyId?: string, year?: number) {
  return useQuery({
    queryKey: ['budget', companyId, 'consumption', year],
    queryFn: async () =>
      (
        await api.get<BudgetConsumption>(`/budget/${companyId}/consumption`, {
          params: year ? { year } : {},
        })
      ).data,
    enabled: !!companyId,
  });
}
