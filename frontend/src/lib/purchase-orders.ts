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
  deliveryAddress: string | null;
  expectedDelivery: string | null;
  totalAmount: string;
  notes: string | null;
  erpPedido: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  sentToSupplierAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
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

export interface SendToSupplierInput {
  recipientEmail?: string;
  skipEmail?: boolean;
  subject?: string;
  bodyText?: string;
}

export function useSendToSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...dto
    }: { id: string } & SendToSupplierInput) =>
      (
        await api.post<PurchaseOrder>(
          `/purchase-orders/${id}/send-to-supplier`,
          dto,
        )
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', data.id] });
    },
  });
}

export function useResendToSupplier() {
  return useMutation({
    mutationFn: async ({
      id,
      ...dto
    }: { id: string } & SendToSupplierInput) =>
      (await api.post(`/purchase-orders/${id}/resend`, dto)).data,
  });
}

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
