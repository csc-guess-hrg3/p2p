import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

export interface FiscalItemRequest {
  id: string;
  companyId: string;
  type: 'LINK';
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

/** Abertura de pendência fiscal — vínculo de item ao fornecedor. */
export interface FiscalItemRequestInput {
  companyId: string;
  supplierErpCode: string;
  itemErpCode: string;
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

/**
 * Aprova uma pendência. A equipe Fiscal pode informar `itemErpCode`
 * para vincular um item diferente do solicitado (correção).
 */
export function useApproveFiscalItemRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      itemErpCode,
    }: {
      id: string;
      itemErpCode?: string;
    }) =>
      (
        await api.post<FiscalItemRequest>(
          `/fiscal-item-requests/${id}/approve`,
          itemErpCode ? { itemErpCode } : {},
        )
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['fiscal-item-requests'] }),
  });
}
