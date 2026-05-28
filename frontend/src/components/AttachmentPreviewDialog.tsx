import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import {
  downloadAttachment,
  fetchAttachmentBlob,
  getPreviewKind,
  ATTACHMENT_DOC_LABELS,
  type Attachment,
} from '@/lib/attachments';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/format';

interface Props {
  attachment: Attachment | null;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Visualizador inline de anexos.
 *
 * Tipos suportados:
 *   - PDF       → `<iframe>` (PDF viewer nativo do browser)
 *   - Imagens   → `<img>` direto
 *   - Demais    → mostra metadados + botão de download (DOCX/XLSX/etc.
 *                 não têm renderer nativo no browser, e Office Online
 *                 só funciona com URLs públicas — fora do escopo MVP)
 *
 * Usa o mesmo endpoint `/attachments/:id/download` mas mantém o blob
 * apenas em memória (object URL revogado ao fechar).
 */
export function AttachmentPreviewDialog({ attachment, onClose }: Props) {
  const { toast } = useToast();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Depende só do `attachment.id` — `toast` é instável e StrictMode em
  // dev re-monta o efeito, então tirar isso evita o "spam de toasts"
  // que aparecia em erros (HTTP 429 do limite, etc.).
  useEffect(() => {
    if (!attachment) return;
    const kind = getPreviewKind(attachment.mimeType, attachment.filename);
    if (kind === 'unsupported') {
      setBlobUrl(null);
      setError(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAttachmentBlob(attachment)
      .then((u) => {
        url = u;
        if (!cancelled) setBlobUrl(u);
      })
      .catch((err) => {
        if (!cancelled) setError(extractApiMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.id]);

  async function handleDownload() {
    if (!attachment) return;
    try {
      await downloadAttachment(attachment);
    } catch (err) {
      toast({
        title: 'Falha no download',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  if (!attachment) return null;
  const previewKind = getPreviewKind(attachment.mimeType, attachment.filename);

  function handleOpenNewTab() {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">
              {attachment.filename}
            </h3>
            <p className="text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide text-[10px]">
                {ATTACHMENT_DOC_LABELS[attachment.kind] ?? attachment.kind}
              </span>
              {' · '}
              {formatSize(attachment.sizeBytes)}
              {' · '}
              {attachment.mimeType}
              {' · '}
              {formatDate(attachment.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {blobUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenNewTab}
                title="Abrir em nova aba"
              >
                <ExternalLink className="size-4" />
                Nova aba
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              title="Baixar"
            >
              <Download className="size-4" />
              Baixar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              title="Fechar"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30">
          {loading && (
            <p className="text-sm text-muted-foreground">
              Carregando pré-visualização…
            </p>
          )}

          {!loading && error && (
            <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
              <FileText className="size-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Não foi possível pré-visualizar
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
              <Button onClick={handleDownload}>
                <Download className="size-4" />
                Baixar arquivo
              </Button>
            </div>
          )}

          {!loading && !error && previewKind === 'pdf' && blobUrl && (
            // <object> tem fallback nativo: se o navegador não souber
            // renderizar PDF (raro hoje), mostra o conteúdo interno.
            // Mais robusto que <iframe> e suporta scroll/zoom do viewer
            // nativo do Chrome/Edge/Firefox.
            <object
              data={blobUrl}
              type="application/pdf"
              className="h-full w-full"
              title={attachment.filename}
              aria-label={attachment.filename}
            >
              <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
                <FileText className="size-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    O navegador não conseguiu exibir o PDF embutido
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Abra em uma nova aba ou baixe o arquivo.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleOpenNewTab}>
                    <ExternalLink className="size-4" />
                    Abrir em nova aba
                  </Button>
                  <Button onClick={handleDownload}>
                    <Download className="size-4" />
                    Baixar
                  </Button>
                </div>
              </div>
            </object>
          )}

          {!loading && !error && previewKind === 'image' && blobUrl && (
            <img
              src={blobUrl}
              alt={attachment.filename}
              className="max-h-full max-w-full object-contain"
              onError={() =>
                setError(
                  'Arquivo de imagem corrompido ou em formato não suportado.',
                )
              }
            />
          )}

          {!loading && previewKind === 'unsupported' && (
            <div className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
              <FileText className="size-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Pré-visualização não disponível
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  O navegador não renderiza este tipo de arquivo inline
                  ({attachment.mimeType}). Baixe para abrir no aplicativo
                  correspondente.
                </p>
              </div>
              <Button onClick={handleDownload}>
                <Download className="size-4" />
                Baixar arquivo
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
