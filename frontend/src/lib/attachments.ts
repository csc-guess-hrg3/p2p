import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * "Parent kind" — a entidade a que o anexo pertence (requisição, PO, etc.).
 * É o segmento do path: `/attachments/:parentKind/:parentId`.
 */
export type ParentKind =
  | 'requisition'
  | 'purchaseOrder'
  | 'receiving'
  | 'fundRequest';

/**
 * "Doc kind" — o tipo do documento anexado. Usado pra validar regras de
 * governança (RN-REQ-02 conta `QUOTATION`). Default `OTHER` quando o
 * usuário não escolhe.
 */
export const ATTACHMENT_DOC_KINDS = [
  'QUOTATION',
  'CONTRACT',
  'INVOICE',
  'RECEIPT_PHOTO',
  'CHECKLIST',
  'OTHER',
] as const;
export type AttachmentDocKind = (typeof ATTACHMENT_DOC_KINDS)[number];

export const ATTACHMENT_DOC_LABELS: Record<AttachmentDocKind, string> = {
  QUOTATION: 'Cotação',
  CONTRACT: 'Contrato',
  INVOICE: 'Nota fiscal',
  RECEIPT_PHOTO: 'Foto/canhoto',
  CHECKLIST: 'Checklist/ata',
  OTHER: 'Outro',
};

export interface Attachment {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  kind: AttachmentDocKind;
  createdAt: string;
  uploadedById?: string;
  /**
   * Cotação vinculada (quando o anexo foi promovido a cotação). Permite
   * a lista de anexos mostrar "Cotação — Fornecedor X · R$ N" em vez de
   * só o nome do arquivo, deixando claro qual cotação cada anexo virou.
   */
  quotation?: {
    id: string;
    supplierName: string;
    supplierErpCode: string | null;
    totalAmount: string;
    isWinner: boolean;
  };
}

export function useAttachments(parentKind: ParentKind, parentId?: string) {
  return useQuery({
    queryKey: ['attachments', parentKind, parentId],
    queryFn: async () =>
      (await api.get<Attachment[]>(`/attachments/${parentKind}/${parentId}`))
        .data,
    enabled: !!parentId,
  });
}

export function useUploadAttachment(
  parentKind: ParentKind,
  parentId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      docKind = 'OTHER',
      // Permite passar o parentId no momento da chamada — necessário
      // pro fluxo de auto-save (rascunho recém-criado tem um id NOVO
      // que o hook nem viu ainda).
      parentIdOverride,
    }: {
      file: File;
      docKind?: AttachmentDocKind;
      parentIdOverride?: string;
    }) => {
      const effective = parentIdOverride ?? parentId;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('attachmentKind', docKind);
      const res = await api.post<Attachment>(
        `/attachments/${parentKind}/${effective}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const effective = variables.parentIdOverride ?? parentId;
      qc.invalidateQueries({
        queryKey: ['attachments', parentKind, effective],
      });
      if (parentKind === 'requisition') {
        qc.invalidateQueries({ queryKey: ['requisitions'] });
      }
    },
  });
}

export function useDeleteAttachment(
  parentKind: ParentKind,
  parentId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/attachments/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', parentKind, parentId] });
      if (parentKind === 'requisition') {
        qc.invalidateQueries({ queryKey: ['requisitions'] });
      }
    },
  });
}

/** Baixa o anexo num blob e dispara o download no browser. */
export async function downloadAttachment(att: Attachment): Promise<void> {
  const res = await api.get(`/attachments/${att.id}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Busca o blob do anexo sem disparar download — usado pelo viewer
 * inline. O chamador é responsável por `URL.revokeObjectURL` depois.
 */
export async function fetchAttachmentBlob(att: Attachment): Promise<string> {
  const res = await api.get(`/attachments/${att.id}/download`, {
    responseType: 'blob',
  });
  // Força o mime correto no blob (o adapter pode entregar como
  // application/octet-stream se o server não setar o header).
  const blob = new Blob([res.data as Blob], { type: att.mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Detecta o tipo de preview suportado pelo navegador a partir do mime.
 * PDFs e imagens renderizam inline; DOCX/XLSX precisam ser baixados
 * (Office Online só funciona com URLs públicas).
 */
export type AttachmentPreviewKind = 'pdf' | 'image' | 'unsupported';

export function getPreviewKind(
  mimeType: string,
  filename?: string,
): AttachmentPreviewKind {
  // Por mime — caminho preferido
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';

  // Fallback por extensão — alguns uploads vêm com
  // application/octet-stream (Windows mal-configurado, upload via app
  // móvel, etc.). Tentamos pelo nome do arquivo antes de desistir.
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.gif') ||
    name.endsWith('.webp') ||
    name.endsWith('.bmp') ||
    name.endsWith('.svg')
  ) {
    return 'image';
  }
  return 'unsupported';
}
