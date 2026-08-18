import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Um relatório disponível no portal (metadados). */
export interface PortalReportListItem {
  key: string;
  title: string;
  description: string;
}

export interface PortalReportColumn {
  name: string;
  type: string;
}

/** Resultado de um relatório: colunas (ordem/tipo) + linhas cruas. */
export interface PortalReportResult {
  key: string;
  title: string;
  description: string;
  columns: PortalReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** true se atingiu o teto de linhas (paginação real vem na fase de exibição). */
  capped: boolean;
  generatedAt: string;
}

/** Lista os relatórios da categoria do usuário externo logado. */
export function usePortalReports() {
  return useQuery({
    queryKey: ['portal', 'reports'],
    queryFn: async () =>
      (await api.get<PortalReportListItem[]>('/portal/reports')).data,
  });
}

/** Roda um relatório (escopado no backend ao próprio usuário). */
export function usePortalReport(key: string | undefined) {
  return useQuery({
    queryKey: ['portal', 'report', key],
    enabled: !!key,
    queryFn: async () =>
      (await api.get<PortalReportResult>(`/portal/reports/${key}`)).data,
  });
}
