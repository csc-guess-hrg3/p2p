import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type NfType = 'NF_EXISTENTE' | 'NF_FUTURA' | 'SEM_NF';

export interface RequisitionItemRateio {
  id: string;
  kind: 'BRANCH' | 'COST_CENTER';
  rateioCode: string;
  targetCode: string;
  branchCode: string | null;
  percentage: string;
  amount: string;
}

export interface RequisitionItem {
  id: string;
  itemErpCode: string | null;
  itemDescription: string;
  quantity: string;
  unit: string;
  estimatedPrice: string;
  totalPrice: string;
  accountingAccount: string;
  accountName: string | null;
  branchRateioCode: string;
  branchRateioDesc: string | null;
  costCenterRateioCode: string;
  costCenterRateioDesc: string | null;
  notes: string | null;
  rateios?: RequisitionItemRateio[];
}

export interface ApprovalStep {
  id: string;
  level: number;
  levelName: string | null;
  status: string;
  decidedAt: string | null;
  comments: string | null;
}

export interface Requisition {
  id: string;
  number: string;
  companyId: string;
  branchErpCode: string;
  branchName: string;
  supplierErpCode: string;
  supplierName: string;
  title: string;
  justification: string | null;
  tipoNotaFiscal: NfType;
  status: string;
  totalAmount: string;
  paymentConditionCode: string | null;
  paymentConditionDesc: string | null;
  recurring: boolean;
  recurrenceMonths: number | null;
  contractRef: string | null;
  tipoCompra: string | null;
  ctbTipoOperacao: number | null;
  naturezaEntrada: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  requester?: { id: string; name: string };
  items?: RequisitionItem[];
  approvalSteps?: ApprovalStep[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}

export interface RequisitionItemInput {
  itemErpCode?: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  accountingAccount: string;
  branchRateioCode: string;
  costCenterRateioCode: string;
  notes?: string;
}

/**
 * Item no formulário (estado da tela). fiscalMode indica se, ao salvar,
 * deve ser aberta uma pendência fiscal:
 *   NONE — item já vinculado ao fornecedor;
 *   LINK — item do catálogo, falta vincular ao fornecedor.
 */
export interface RequisitionItemForm {
  fiscalMode: 'NONE' | 'LINK';
  itemErpCode: string | null;
  itemDescription: string;
  unit: string;
  quantity: number;
  estimatedPrice: number;
  accountingAccount: string;
  branchRateioCode: string;
  costCenterRateioCode: string;
  notes?: string;
}

export interface RequisitionInput {
  companyId: string;
  branchErpCode: string;
  supplierErpCode: string;
  title: string;
  justification: string;
  tipoNotaFiscal: NfType;
  paymentConditionCode: string;
  recurring?: boolean;
  recurrenceMonths?: number;
  contractRef?: string;
  tipoCompra?: string;
  items: RequisitionItemInput[];
}

export interface FiscalClassifyInput {
  ctbTipoOperacao: number;
  naturezaEntrada: string;
  tipoCompra?: string;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export interface RequisitionListParams {
  companyId?: string;
  status?: string;
  search?: string;
  mine?: string;
}

export function useRequisitions(params: RequisitionListParams) {
  return useQuery({
    queryKey: ['requisitions', params],
    queryFn: async () =>
      (await api.get<Paginated<Requisition>>('/requisitions', { params }))
        .data,
  });
}

export function useRequisition(id: string | undefined) {
  return useQuery({
    queryKey: ['requisition', id],
    queryFn: async () =>
      (await api.get<Requisition>(`/requisitions/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: RequisitionInput) =>
      (await api.post<Requisition>('/requisitions', dto)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}

export function useUpdateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      dto,
    }: {
      id: string;
      dto: Partial<RequisitionInput>;
    }) => (await api.patch<Requisition>(`/requisitions/${id}`, dto)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisition', data.id] });
    },
  });
}

export function useSubmitRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Requisition>(`/requisitions/${id}/submit`)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisition', data.id] });
    },
  });
}

export function useFiscalClassify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...dto
    }: { id: string } & FiscalClassifyInput) =>
      (await api.patch<Requisition>(`/requisitions/${id}/fiscal-classify`, dto))
        .data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisition', data.id] });
    },
  });
}

export function useDeleteRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/requisitions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisitions'] }),
  });
}
