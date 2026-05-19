import { useQuery } from '@tanstack/react-query';
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
