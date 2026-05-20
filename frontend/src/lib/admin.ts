import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/* ------------------------------------------------------------------ */
/* ERP CONFIG                                                         */
/* ------------------------------------------------------------------ */

export interface ErpConfigPayload {
  codTransacao: string;
  tabelaFilha: string;
  tipoCompraDefault: string;
  ctbTipoOperacaoDefault: number;
  naturezaEntradaDefault: string;
  moeda: string;
  transportadoraPadrao: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  smtpFrom: string | null;
  smtpFromName: string | null;
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  hasSmtpPassword: boolean;
}

export interface CompanyErpConfigResponse {
  companyId: string;
  companyCode: string;
  companyName: string;
  config: ErpConfigPayload | null;
}

export function useErpConfig(companyId?: string) {
  return useQuery({
    queryKey: ['erp-config', companyId],
    queryFn: async () =>
      (
        await api.get<CompanyErpConfigResponse>(
          `/companies/${companyId}/erp-config`,
        )
      ).data,
    enabled: !!companyId,
  });
}

export interface ErpConfigPatch extends Partial<Omit<ErpConfigPayload, 'hasSmtpPassword'>> {
  /** undefined preserva atual; null limpa; string grava nova */
  smtpPassword?: string | null;
}

export function useUpdateErpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      patch,
    }: {
      companyId: string;
      patch: ErpConfigPatch;
    }) =>
      (await api.put(`/companies/${companyId}/erp-config`, patch)).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['erp-config', vars.companyId] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* SETTINGS                                                           */
/* ------------------------------------------------------------------ */

export interface SystemSettingItem {
  key: string;
  label: string;
  description: string | null;
  type: string;
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
}

export function useSystemSettings(companyId?: string) {
  return useQuery({
    queryKey: ['settings', companyId],
    queryFn: async () =>
      (
        await api.get<SystemSettingItem[]>('/settings', {
          params: { companyId },
        })
      ).data,
    enabled: !!companyId,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      key,
      value,
    }: {
      companyId: string;
      key: string;
      value: string;
    }) => (await api.put(`/settings/${key}`, { companyId, value })).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['settings', vars.companyId] });
    },
  });
}
