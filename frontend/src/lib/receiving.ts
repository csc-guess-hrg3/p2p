import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface ReceivingItem {
  id: string;
  purchaseOrderItemId: string;
  receivedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  rejectionReason: string | null;
}

export interface Receiving {
  id: string;
  number: string;
  purchaseOrderId: string;
  companyId: string;
  status: string;
  receivedAt: string;
  measurementStart: string | null;
  measurementEnd: string | null;
  completionPct: string | null;
  notes: string | null;
  divergenceNotes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  fiscalDocumentId?: string | null;
  receivedBy?: { id: string; name: string };
  purchaseOrder?: { id: string; number: string; status?: string };
  fiscalDocument?: {
    id: string;
    type: string;
    numero: string;
    serie: string | null;
    supplierName: string;
    supplierCnpj: string;
    valorTotal: string;
    emissao: string;
    status: string;
  } | null;
  items?: ReceivingItem[];
}

/** Nota candidata a lastrear o recebimento (com conferência de cabeçalho). */
export interface ReceivingCandidateNote {
  id: string;
  type: string;
  numero: string;
  serie: string | null;
  supplierName: string;
  supplierCnpj: string;
  valorTotal: string;
  emissao: string;
  status: string;
  purchaseOrderId: string | null;
  alreadyLinked: boolean;
  supplierMatch: boolean;
  valorNota: number;
  totalPedido: number;
  excedePedido: boolean;
}

export interface ReceivingItemInput {
  purchaseOrderItemId: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty?: number;
  rejectionReason?: string;
}

export interface ReceivingInput {
  purchaseOrderId: string;
  receivedAt?: string;
  measurementStart?: string;
  measurementEnd?: string;
  completionPct?: number;
  notes?: string;
  fiscalDocumentId?: string;
  items: ReceivingItemInput[];
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export interface ReceivingListParams {
  companyId?: string;
  purchaseOrderId?: string;
  status?: string;
  search?: string;
}

export function useReceivings(params: ReceivingListParams) {
  return useQuery({
    queryKey: ['receivings', params],
    queryFn: async () =>
      (await api.get<Paginated<Receiving>>('/receiving', { params })).data,
  });
}

export function useReceiving(id: string | undefined) {
  return useQuery({
    queryKey: ['receiving', id],
    queryFn: async () => (await api.get<Receiving>(`/receiving/${id}`)).data,
    enabled: !!id,
  });
}

/**
 * Notas candidatas para lastrear um recebimento deste pedido — usadas na tela
 * de registrar recebimento (anexar a nota + conferência de cabeçalho).
 */
export function useReceivingCandidateNotes(poId: string | undefined) {
  return useQuery({
    queryKey: ['receiving-candidate-notes', poId],
    queryFn: async () =>
      (
        await api.get<ReceivingCandidateNote[]>(
          `/fiscal-documents/receiving-candidates/${poId}`,
        )
      ).data,
    enabled: !!poId,
  });
}

export function useCreateReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ReceivingInput) =>
      (await api.post<Receiving>('/receiving', dto)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['receivings'] });
      qc.invalidateQueries({ queryKey: ['receiving', data.id] });
      // Saldo do PC pode ter mudado quando o recebimento for confirmado;
      // já invalidamos aqui para refletir status na detail page do PC.
      qc.invalidateQueries({ queryKey: ['purchase-order', data.purchaseOrderId] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useConfirmReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Receiving>(`/receiving/${id}/confirm`)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['receivings'] });
      qc.invalidateQueries({ queryKey: ['receiving', data.id] });
      qc.invalidateQueries({
        queryKey: ['purchase-order', data.purchaseOrderId],
      });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
