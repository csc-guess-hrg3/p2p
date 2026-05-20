import { useRef } from 'react';
import { isAxiosError } from 'axios';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import {
  downloadAttachment,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  type Attachment,
  type AttachmentKind,
} from '@/lib/attachments';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  kind: AttachmentKind;
  parentId?: string;
  /** Quando true, esconde o botão de excluir (ex.: somente leitura). */
  readOnly?: boolean;
  /** Texto curto que explica o que esperar (canhoto, foto, ata, etc.). */
  hint?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Seção de anexos reutilizável: lista + upload + download + exclusão.
 * Usada no detalhe do recebimento, da requisição e do PC.
 */
export function AttachmentsSection({ kind, parentId, readOnly, hint }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: items = [], isLoading } = useAttachments(kind, parentId);
  const uploadMut = useUploadAttachment(kind, parentId);
  const deleteMut = useDeleteAttachment(kind, parentId);

  function handlePick() {
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMut.mutateAsync(file);
      toast({
        title: 'Anexo enviado',
        description: file.name,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha no upload',
        description: msg || 'Tente outro arquivo.',
        variant: 'destructive',
      });
    } finally {
      // Permite re-selecionar o mesmo arquivo se quiser.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDownload(att: Attachment) {
    try {
      await downloadAttachment(att);
    } catch {
      toast({
        title: 'Falha no download',
        description: att.filename,
        variant: 'destructive',
      });
    }
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`Excluir o anexo "${att.filename}"?`)) return;
    try {
      await deleteMut.mutateAsync(att.id);
    } catch {
      toast({
        title: 'Falha ao excluir',
        description: att.filename,
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Paperclip className="size-4" />
            Anexos
          </h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {!readOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handlePick}
              disabled={uploadMut.isPending}
            >
              <Upload className="size-4" />
              {uploadMut.isPending ? 'Enviando…' : 'Adicionar anexo'}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(a.sizeBytes)} · {a.mimeType}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(a)}
                  title="Baixar"
                >
                  <Download className="size-4" />
                </Button>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(a)}
                    title="Excluir"
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
