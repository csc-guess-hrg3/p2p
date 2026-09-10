import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

export interface FiscalItemRequest {
  id: string;
  companyId: string;
  type: 'LINK' | 'NEW';
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

/* ------------------------------------------------------------------ */
/* Classificação de item LIVRE (descrição solta → vincular ou criar). */
/* ------------------------------------------------------------------ */

/** Item livre aguardando classificação fiscal (linha da fila). */
export interface ClassificationItem {
  id: string;
  itemDescription: string;
  quantity: string | number;
  unit: string;
  estimatedPrice: string | number;
  branchRateioCode: string;
  costCenterRateioCode: string;
  createdAt: string;
  requisition: {
    id: string;
    number: string;
    companyId: string;
    status: string;
    supplierErpCode: string | null;
    supplierName: string;
    company: { code: string };
    requester: { id: string; name: string } | null;
  };
}

/** Item existente sugerido para o item livre. */
export interface ItemSuggestion {
  codigo: string;
  descricao: string;
  unidade: string | null;
  contaContabilPadrao: string | null;
  grupo: string | null;
  linked: boolean;
  score: number;
}

/** Prévia do item que será gravado no Linx (create com confirm:false). */
export interface CreateItemPreview {
  preview: true;
  item: {
    codigo: string;
    descricao: string;
    unidade: string;
    contaContabil: string;
    contaNome?: string;
    ncm: string;
    origem: string;
    grupo: string | null;
    tipoSped: string | null;
    cfop: number | null;
    rateioFilial: string | null;
    rateioCc: string | null;
  };
}

export interface CreateClassifiedItemInput {
  accountingAccount: string;
  descricao?: string;
  unidade?: string;
  ncm?: string;
  origem?: string;
  grupo?: string;
  tipoSped?: string;
  cfop?: number;
  confirm?: boolean;
}

export function useItemClassificationQueue(params: { companyId?: string } = {}) {
  return useQuery({
    queryKey: ['item-classification-queue', params],
    queryFn: async () =>
      (
        await api.get<Paginated<ClassificationItem>>(
          '/item-classification/queue',
          { params },
        )
      ).data,
  });
}

export function useItemSuggestions(reqItemId: string | undefined) {
  return useQuery({
    queryKey: ['item-suggestions', reqItemId],
    queryFn: async () =>
      (
        await api.get<{ description: string; suggestions: ItemSuggestion[] }>(
          `/item-classification/${reqItemId}/suggestions`,
        )
      ).data,
    enabled: !!reqItemId,
  });
}

export function useLinkClassifiedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reqItemId,
      itemErpCode,
    }: {
      reqItemId: string;
      itemErpCode: string;
    }) =>
      (
        await api.post(`/item-classification/${reqItemId}/link`, {
          itemErpCode,
        })
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['item-classification-queue'] }),
  });
}

/**
 * Cria (ou pré-visualiza) um item novo. Com `confirm:false` só devolve a
 * prévia; com `confirm:true` grava no Linx e vincula.
 */
export function useCreateClassifiedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reqItemId,
      dto,
    }: {
      reqItemId: string;
      dto: CreateClassifiedItemInput;
    }) =>
      (await api.post(`/item-classification/${reqItemId}/create`, dto)).data,
    onSuccess: (_data, vars) => {
      if (vars.dto.confirm) {
        qc.invalidateQueries({ queryKey: ['item-classification-queue'] });
      }
    },
  });
}
