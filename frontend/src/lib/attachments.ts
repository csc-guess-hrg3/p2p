import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type AttachmentKind =
  | 'requisition'
  | 'purchaseOrder'
  | 'receiving'
  | 'fundRequest';

export interface Attachment {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  uploadedById?: string;
}

export function useAttachments(kind: AttachmentKind, parentId?: string) {
  return useQuery({
    queryKey: ['attachments', kind, parentId],
    queryFn: async () =>
      (await api.get<Attachment[]>(`/attachments/${kind}/${parentId}`)).data,
    enabled: !!parentId,
  });
}

export function useUploadAttachment(kind: AttachmentKind, parentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<Attachment>(
        `/attachments/${kind}/${parentId}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', kind, parentId] });
    },
  });
}

export function useDeleteAttachment(kind: AttachmentKind, parentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/attachments/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', kind, parentId] });
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
