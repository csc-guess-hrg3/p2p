import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface PurchaseOrderItemRateio {
  id: string;
  kind: 'BRANCH' | 'COST_CENTER';
  rateioCode: string;
  targetCode: string;
  branchCode: string | null;
  percentage: string;
  amount: string;
}

export interface PurchaseOrderItem {
  id: string;
  requisitionItemId: string | null;
  itemErpCode: string | null;
  itemDescription: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  accountingAccount: string;
  accountName: string | null;
  branchRateioCode: string;
  branchRateioDesc: string | null;
  costCenterRateioCode: string;
  costCenterRateioDesc: string | null;
  receivedQty: string;
  cancelledQty: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  rateios?: PurchaseOrderItemRateio[];
}

export interface PurchaseOrder {
  id: string;
  number: string;
  requisitionId: string;
  companyId: string;
  branchErpCode: string;
  branchName: string;
  supplierErpCode: string;
  supplierName: string;
  status: string;
  paymentCondition: string | null;
  transportadora: string | null;
  deliveryAddress: string | null;
  expectedDelivery: string | null;
  totalAmount: string;
  notes: string | null;
  erpPedido: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  sentToSupplierAt: string | null;
  integratedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  lastEditReason: string | null;
  lastEditedAt: string | null;
  lastEditedById: string | null;
  createdAt: string;
  buyer?: { id: string; name: string };
  items?: PurchaseOrderItem[];
  fundRequest?: { id: string; number: string } | null;
}

/** Ajuste de preço negociado de um item, no momento da conversão. */
export interface PoItemAdjustment {
  requisitionItemId: string;
  unitPrice: number;
}

export interface ConvertToPurchaseOrderInput {
  requisitionId: string;
  paymentCondition?: string;
  transportadora?: string;
  deliveryAddress?: string;
  expectedDelivery?: string;
  fundRequestDueDate?: string;
  items?: PoItemAdjustment[];
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export interface PurchaseOrderListParams {
  companyId?: string;
  status?: string;
  search?: string;
}

export function usePurchaseOrders(params: PurchaseOrderListParams) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: async () =>
      (await api.get<Paginated<PurchaseOrder>>('/purchase-orders', { params }))
        .data,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () =>
      (await api.get<PurchaseOrder>(`/purchase-orders/${id}`)).data,
    enabled: !!id,
  });
}

/**
 * Estado read-through do PC no Linx (QTDE_ENTREGUE, QTDE_CANCEL_PEDIDO,
 * status do cabeçalho). Cron BACK_SYNC atualiza o P2P a cada 30 min;
 * este hook pega o estado AGORA, sob demanda, sem mexer no banco P2P.
 */
export interface ErpStatusItem {
  codigo: string | null;
  consumivel: string | null;
  qtde_original: number;
  qtde_entregue: number;
  qtde_cancel_pedido: number;
  qtde_entregar: number;
  valor_original: number;
  valor_entregue: number;
  valor_entregar: number;
}
export interface ErpStatus {
  items: ErpStatusItem[];
  cabecalho: {
    status_compra: string | null;
    status_aprovacao: string | null;
    lx_status_compra: number | null;
    data_aprovacao: string | null;
    aprovado_por: string | null;
  } | null;
}

export function usePurchaseOrderErpStatus(
  id: string | undefined,
  enabled = false,
) {
  return useQuery({
    queryKey: ['purchase-order-erp-status', id],
    queryFn: async () =>
      (await api.get<ErpStatus>(`/purchase-orders/${id}/erp-status`)).data,
    enabled: !!id && enabled,
    staleTime: 0, // sempre pede de novo — a graça do read-through é ver agora
  });
}

export function useTriggerErpBackSync() {
  return useMutation({
    mutationFn: async () =>
      (await api.post('/purchase-orders/admin/erp-back-sync')).data,
  });
}

export function useConvertToPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ConvertToPurchaseOrderInput) =>
      (await api.post<PurchaseOrder>('/purchase-orders', dto)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['fund-requests'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisition', data.requisitionId] });
    },
  });
}

// Os hooks de envio ao fornecedor foram removidos: a gravação no Linx
// agora é automática no `useConvertToPurchaseOrder` (decisão de
// processo — consumíveis não emitem mais e-mail ao fornecedor).

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cancellationReason,
    }: {
      id: string;
      cancellationReason: string;
    }) =>
      (
        await api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`, {
          cancellationReason,
        })
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', data.id] });
    },
  });
}

/** Edição do PC: volta pra fluxo de aprovação + atualiza Linx pra 'em estudo'. */
export interface EditPoInput {
  id: string;
  reason: string;
  paymentCondition?: string;
  transportadora?: string;
  deliveryAddress?: string;
  expectedDelivery?: string;
  items?: Array<{ id: string; unitPrice?: number; quantity?: number }>;
}

export function useEditPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: EditPoInput) =>
      (await api.post<PurchaseOrder>(`/purchase-orders/${id}/edit`, payload))
        .data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', data.id] });
      qc.invalidateQueries({ queryKey: ['po-history', data.id] });
    },
  });
}

export interface PoHistoryEvent {
  at: string;
  kind: string;
  label: string;
  who?: string | null;
  detail?: string | null;
}

export function usePurchaseOrderHistory(id?: string) {
  return useQuery({
    queryKey: ['po-history', id],
    queryFn: async () =>
      (await api.get<PoHistoryEvent[]>(`/purchase-orders/${id}/history`)).data,
    enabled: !!id,
  });
}

/** RN-OC-03: cancela só o saldo dos itens informados. */
export function useCancelPurchaseOrderItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      itemIds,
      reason,
    }: {
      id: string;
      itemIds: string[];
      reason: string;
    }) =>
      (
        await api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel-items`, {
          itemIds,
          reason,
        })
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', data.id] });
    },
  });
}
