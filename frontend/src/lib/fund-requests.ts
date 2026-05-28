import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface FundRequestItem {
  id: string;
  itemErpCode: string | null;
  description: string;
  beneficiaryName: string;
  beneficiaryBank: string | null;
  beneficiaryAgency: string | null;
  beneficiaryAccount: string | null;
  accountingAccount: string;
  accountName: string | null;
  branchRateioCode: string;
  branchRateioDesc: string | null;
  costCenterRateioCode: string;
  costCenterRateioDesc: string | null;
  amount: string;
  dueDate: string;
  notes: string | null;
}

export interface FundRequest {
  id: string;
  number: string;
  companyId: string;
  requisitionId: string | null;
  purchaseOrderId: string | null;
  title: string;
  status: string;
  totalAmount: string;
  erpSolicitacao: string | null;
  integratedAt: string | null;
  lastErpError: string | null;
  lastErpAttemptAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  requester?: { id: string; name: string };
  requisition?: { id: string; number: string } | null;
  purchaseOrder?: { id: string; number: string } | null;
  items?: FundRequestItem[];
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export interface FundRequestListParams {
  companyId?: string;
  status?: string;
  search?: string;
}

export function useFundRequests(params: FundRequestListParams) {
  return useQuery({
    queryKey: ['fund-requests', params],
    queryFn: async () =>
      (await api.get<Paginated<FundRequest>>('/fund-requests', { params }))
        .data,
  });
}

export function useFundRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['fund-request', id],
    queryFn: async () =>
      (await api.get<FundRequest>(`/fund-requests/${id}`)).data,
    enabled: !!id,
  });
}

export interface SvHistoryEvent {
  at: string;
  kind: string;
  label: string;
  who?: string | null;
  detail?: string | null;
}

/**
 * Reintegração manual da SV no Linx — usado pelo botão "Reintegrar Linx"
 * que aparece na tela de detalhe quando há `lastErpError`. O backend é
 * idempotente: se já tem erpSolicitacao, devolve sem nova gravação.
 */
export function useRetryFundRequestErp(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ erpSolicitacao: string }>(
        `/fund-requests/${id}/retry-erp`,
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund-request', id] });
      qc.invalidateQueries({ queryKey: ['fund-requests'] });
    },
  });
}

export function useFundRequestHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['fund-request-history', id],
    queryFn: async () =>
      (await api.get<SvHistoryEvent[]>(`/fund-requests/${id}/history`)).data,
    enabled: !!id,
  });
}
