import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Cliente do módulo de Documentos Fiscais (NFe da Qive).
 * MVP: só vincula manualmente ao PC; download de XML/DANFe.
 */

export type FiscalDocStatus = 'PENDING' | 'LINKED' | 'IGNORED' | 'INTERNAL';

export interface FiscalDocSummary {
  id: string;
  type: string;
  accessKey: string;
  numero: string;
  serie: string | null;
  natOp: string | null;
  supplierCnpj: string;
  supplierName: string;
  destCnpj: string;
  destName: string | null;
  valorTotal: string;
  emissao: string;
  status: FiscalDocStatus;
  purchaseOrderId: string | null;
  linkedAt: string | null;
  company: { id: string; code: string; name: string };
  purchaseOrder: { id: string; number: string; status: string } | null;
}

export interface FiscalDocItem {
  num: number;
  cProd: string;
  xProd: string;
  ncm: string | null;
  cfop: string | null;
  qCom: number;
  uCom: string | null;
  vUnCom: number;
  vProd: number;
}

export interface FiscalDocDetail extends FiscalDocSummary {
  rawXmlBase64?: string;
  itemsJson?: string | null;
  items: FiscalDocItem[];
  notes: string | null;
  linkedBy: { id: string; name: string; email: string } | null;
  qiveCursor: number | null;
}

export interface FiscalDocCandidate {
  id: string;
  number: string;
  status: string;
  supplierName: string;
  supplierErpCode: string;
  totalAmount: string;
  expectedDelivery: string | null;
  createdAt: string;
  erpPedido: string | null;
}

export interface FiscalDocList {
  total: number;
  page: number;
  pageSize: number;
  rows: FiscalDocSummary[];
}

export interface FiscalDocQuery {
  status?: FiscalDocStatus | '';
  supplierCnpj?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useFiscalDocuments(params: FiscalDocQuery = {}) {
  return useQuery({
    queryKey: ['fiscal-documents', params],
    queryFn: async () =>
      (await api.get<FiscalDocList>('/fiscal-documents', { params })).data,
  });
}

export function useFiscalDocument(id: string | null | undefined) {
  return useQuery({
    queryKey: ['fiscal-document', id],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<FiscalDocDetail>(`/fiscal-documents/${id}`)).data,
  });
}

export function useFiscalDocCandidates(id: string | null | undefined) {
  return useQuery({
    queryKey: ['fiscal-document-candidates', id],
    enabled: !!id,
    queryFn: async () =>
      (
        await api.get<FiscalDocCandidate[]>(
          `/fiscal-documents/${id}/candidates`,
        )
      ).data,
  });
}

export function useFiscalDocumentsByPo(poId: string | null | undefined) {
  return useQuery({
    queryKey: ['fiscal-documents-by-po', poId],
    enabled: !!poId,
    queryFn: async () =>
      (
        await api.get<FiscalDocSummary[]>(
          `/fiscal-documents/by-po/${poId}`,
        )
      ).data,
  });
}

function invalidateFiscalQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['fiscal-documents'] });
  qc.invalidateQueries({ queryKey: ['fiscal-document'] });
  qc.invalidateQueries({ queryKey: ['fiscal-documents-by-po'] });
}

export function useLinkFiscalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; purchaseOrderId: string }) =>
      (
        await api.post(
          `/fiscal-documents/${vars.id}/link/${vars.purchaseOrderId}`,
        )
      ).data,
    onSuccess: () => invalidateFiscalQueries(qc),
  });
}

export function useUnlinkFiscalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/fiscal-documents/${id}/link`)).data,
    onSuccess: () => invalidateFiscalQueries(qc),
  });
}

export function useIgnoreFiscalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; reason?: string }) =>
      (
        await api.post(`/fiscal-documents/${vars.id}/ignore`, {
          reason: vars.reason,
        })
      ).data,
    onSuccess: () => invalidateFiscalQueries(qc),
  });
}

export function useRestoreFiscalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/fiscal-documents/${id}/restore`)).data,
    onSuccess: () => invalidateFiscalQueries(qc),
  });
}

export function useTriggerFiscalSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post('/fiscal-documents/admin/sync')).data,
    onSuccess: () => invalidateFiscalQueries(qc),
  });
}

/** Dispara download do XML cru. */
export async function downloadFiscalXml(doc: {
  id: string;
  accessKey: string;
}): Promise<void> {
  const res = await api.get(`/fiscal-documents/${doc.id}/xml`, {
    responseType: 'blob',
  });
  triggerBlobDownload(
    res.data as Blob,
    `${doc.accessKey}.xml`,
    'application/xml',
  );
}

/** Dispara download do DANFe (PDF). */
export async function downloadFiscalDanfe(doc: {
  id: string;
  accessKey: string;
}): Promise<void> {
  const res = await api.get(`/fiscal-documents/${doc.id}/danfe`, {
    responseType: 'blob',
  });
  triggerBlobDownload(
    res.data as Blob,
    `DANFe-${doc.accessKey}.pdf`,
    'application/pdf',
  );
}

function triggerBlobDownload(blob: Blob, filename: string, mime: string): void {
  const typedBlob = new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function statusLabel(s: FiscalDocStatus): string {
  switch (s) {
    case 'PENDING':
      return 'Pendente';
    case 'LINKED':
      return 'Vinculada';
    case 'IGNORED':
      return 'Ignorada';
    case 'INTERNAL':
      return 'Transferência interna';
  }
}
