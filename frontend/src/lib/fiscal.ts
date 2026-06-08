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

/** Requisição que casa com a pendência (mesma empresa+fornecedor+item). */
export interface RelatedRequisition {
  id: string;
  number: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  requester?: { id: string; name: string } | null;
}

export interface FiscalItemRequestDetail extends FiscalItemRequest {
  relatedRequisitions: RelatedRequisition[];
}

export function useFiscalItemRequests(
  params: { status?: string; companyId?: string } = {},
) {
  return useQuery({
    queryKey: ['fiscal-item-requests', params],
    queryFn: async () =>
      (await api.get<FiscalListResult>('/fiscal-item-requests', { params }))
        .data,
  });
}

/** Detalhe de uma pendência, com as requisições relacionadas (rastro reverso). */
export function useFiscalItemRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['fiscal-item-request', id],
    queryFn: async () =>
      (await api.get<FiscalItemRequestDetail>(`/fiscal-item-requests/${id}`))
        .data,
    enabled: !!id,
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

/** Rejeita/descarta uma pendência obsoleta (órfã). Exige motivo. */
export function useRejectFiscalItemRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      rejectionReason,
    }: {
      id: string;
      rejectionReason: string;
    }) =>
      (
        await api.post<FiscalItemRequest>(
          `/fiscal-item-requests/${id}/reject`,
          { rejectionReason },
        )
      ).data,
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
