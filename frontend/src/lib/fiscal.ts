import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

export type FiscalRequestType = 'LINK' | 'NEW';

export interface FiscalItemRequest {
  id: string;
  companyId: string;
  type: FiscalRequestType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  supplierErpCode: string;
  supplierName: string;
  itemErpCode: string | null;
  itemDescription: string;
  unit: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  requestedBy?: { id: string; name: string };
  resolvedBy?: { id: string; name: string };
}

export interface FiscalItemRequestInput {
  companyId: string;
  type: FiscalRequestType;
  supplierErpCode: string;
  itemErpCode?: string;
  itemDescription: string;
  unit?: string;
  notes?: string;
}

interface FiscalListResult extends Paginated<FiscalItemRequest> {
  isFiscalUser: boolean;
}

export function useFiscalItemRequests(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['fiscal-item-requests', params],
    queryFn: async () =>
      (await api.get<FiscalListResult>('/fiscal-item-requests', { params }))
        .data,
  });
}

export function useCreateFiscalItemRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: FiscalItemRequestInput) =>
      (await api.post<FiscalItemRequest>('/fiscal-item-requests', dto)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['fiscal-item-requests'] }),
  });
}

export function useApproveFiscalItemRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      dto,
    }: {
      id: string;
      dto: {
        itemErpCode?: string;
        unit?: string;
        accountingAccount?: string;
        branchRateioCode?: string;
        costCenterRateioCode?: string;
      };
    }) =>
      (await api.post<FiscalItemRequest>(
        `/fiscal-item-requests/${id}/approve`,
        dto,
      )).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['fiscal-item-requests'] }),
  });
}

export function useRejectFiscalItemRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post<FiscalItemRequest>(
        `/fiscal-item-requests/${id}/reject`,
        { reason },
      )).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['fiscal-item-requests'] }),
  });
}
