import { useRef, useState } from 'react';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  downloadAttachment,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  ATTACHMENT_DOC_KINDS,
  ATTACHMENT_DOC_LABELS,
  type Attachment,
  type AttachmentDocKind,
  type ParentKind,
} from '@/lib/attachments';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  /** Entidade a que o anexo pertence: requisição, PO, recebimento, etc. */
  kind: ParentKind;
  parentId?: string;
  /** Quando true, esconde o botão de excluir (ex.: somente leitura). */
  readOnly?: boolean;
  /** Texto curto que explica o que esperar (canhoto, foto, ata, etc.). */
  hint?: string;
  /**
   * Tipos de documento que fazem sentido nesta tela. Default = todos,
   * com `OTHER` selecionado. Em recebimentos, por exemplo, faz sentido
   * limitar a `RECEIPT_PHOTO` e `CHECKLIST`.
   */
  allowedDocKinds?: readonly AttachmentDocKind[];
  /** Pré-seleção do tipo (ex.: receivings → `RECEIPT_PHOTO`). */
  defaultDocKind?: AttachmentDocKind;
  /**
   * Callback chamado quando um anexo do tipo QUOTATION é enviado com
   * sucesso. A página pai usa pra abrir o diálogo de cadastro de
   * cotação (CNPJ, valor, itens, etc.).
   */
  onQuotationUploaded?: (attachment: Attachment) => void;
  /**
   * Chamado ANTES do upload quando o `parentId` ainda não existe
   * (cenário: rascunho de requisição que o usuário ainda não salvou).
   * A página pai deve criar o documento e retornar o `parentId` novo,
   * ou `null` se a criação for cancelada / validação falhar.
   *
   * Quando este callback está definido e `parentId` é undefined, o botão
   * de adicionar continua habilitado — a criação acontece transparente
   * no fluxo de upload.
   */
  onBeforeUpload?: () => Promise<string | null>;
  /**
   * Esconde anexos que já estão vinculados a alguma cotação. Útil pra
   * requisição — o anexo da cotação aparece no card da própria cotação
   * (mais claro qual PDF é de qual fornecedor) e não polui a lista geral.
   */
  hideLinkedQuotations?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Seção de anexos reutilizável: lista + upload tipado + download + exclusão.
 *
 * O usuário escolhe o **tipo do documento** (cotação/contrato/foto/etc.)
 * antes de selecionar o arquivo — o tipo é persistido em
 * `attachments.kind` e usado pelas regras de governança (RN-REQ-02
 * conta `QUOTATION`).
 */
export function AttachmentsSection({
  kind,
  parentId,
  readOnly,
  hint,
  allowedDocKinds = ATTACHMENT_DOC_KINDS,
  defaultDocKind,
  onQuotationUploaded,
  onBeforeUpload,
  hideLinkedQuotations,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: rawItems = [], isLoading } = useAttachments(kind, parentId);
  // Quando `hideLinkedQuotations` está ativo, omite anexos que já viraram
  // cotação — eles aparecem no QuotationsCard com o nome do fornecedor.
  const items = hideLinkedQuotations
    ? rawItems.filter((a) => !a.quotation)
    : rawItems;
  const uploadMut = useUploadAttachment(kind, parentId);
  const deleteMut = useDeleteAttachment(kind, parentId);

  // Quando a página NÃO passa `defaultDocKind`, deixamos o tipo
  // vazio — força o usuário a escolher conscientemente. Só vira
  // obrigatório no momento do upload (se nenhum arquivo for selecionado,
  // não dá pra exigir tipo). Páginas que têm um tipo natural
  // (ex.: Recebimentos passa RECEIPT_PHOTO) pré-selecionam e seguem
  // funcionando como antes.
  const [docKind, setDocKind] = useState<AttachmentDocKind | null>(
    defaultDocKind ?? null,
  );
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);

  function handlePick() {
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    let files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Tipo do documento é obrigatório só agora (no momento do upload).
    // Antes disso, o select pode ficar vazio.
    if (!docKind) {
      toast({
        title: 'Selecione o tipo do documento',
        description:
          'Antes de enviar, escolha se é cotação, contrato, fatura, etc.',
        variant: 'destructive',
      });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    // Cotação é 1-arquivo-por-cota — cada cotação tem CNPJ + itens
    // próprios, então faz sentido obrigar único arquivo + dialog.
    const isQuotation = docKind === 'QUOTATION';
    if (isQuotation && files.length > 1) {
      toast({
        title: 'Selecione um arquivo por vez',
        description:
          'Cada cotação representa uma proposta de fornecedor. Envie um arquivo e cadastre os dados; repita para outras propostas.',
        variant: 'destructive',
      });
      files = files.slice(0, 1);
    }

    // Auto-save: se a entidade pai ainda não existe (parentId vazio) e o
    // host nos deu um callback, criamos o rascunho agora pra ter um id
    // antes de subir o arquivo. Permite anexar cotações já na tela de
    // criação da requisição, sem fricção de "salve primeiro".
    let effectiveParentId = parentId;
    if (!effectiveParentId && onBeforeUpload) {
      const newId = await onBeforeUpload();
      if (!newId) {
        if (inputRef.current) inputRef.current.value = '';
        return; // validação falhou ou usuário cancelou
      }
      effectiveParentId = newId;
    }
    if (!effectiveParentId) {
      // Caso raro: parentId continua undefined sem callback de auto-save.
      // Não dá pra subir nada — limpa o input e sai.
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    // Uploads sequenciais (não paralelos) — o backend valida o limite
    // de 10 anexos por parent e retornaria 400 se mandássemos tudo de
    // uma vez ultrapassando o teto. Sequencial também dá feedback mais
    // legível em caso de falha parcial.
    const successes: string[] = [];
    const failures: { name: string; reason: string }[] = [];
    let lastUploaded: Attachment | null = null;
    for (const file of files) {
      try {
        const uploaded = await uploadMut.mutateAsync({
          file,
          docKind,
          parentIdOverride: effectiveParentId,
        });
        successes.push(file.name);
        lastUploaded = uploaded;
      } catch (err) {
        failures.push({
          name: file.name,
          reason: extractApiMessage(err, 'Falha desconhecida.'),
        });
      }
    }
    if (inputRef.current) inputRef.current.value = '';

    // Se foi cotação e o upload deu certo, devolve pra página abrir
    // o dialog de cadastro. Pulamos os toasts comuns nesse caso — o
    // dialog seguinte é o feedback.
    if (isQuotation && lastUploaded && failures.length === 0) {
      onQuotationUploaded?.(lastUploaded);
      return;
    }

    if (successes.length > 0 && failures.length === 0) {
      toast({
        title:
          successes.length === 1
            ? 'Anexo enviado'
            : `${successes.length} anexos enviados`,
        description:
          successes.length === 1
            ? `${successes[0]} (${ATTACHMENT_DOC_LABELS[docKind]})`
            : `${ATTACHMENT_DOC_LABELS[docKind]} · ${successes.join(', ')}`,
        variant: 'success',
      });
    } else if (failures.length > 0 && successes.length === 0) {
      toast({
        title:
          failures.length === 1
            ? 'Falha no upload'
            : `${failures.length} uploads falharam`,
        description: failures.map((f) => `${f.name}: ${f.reason}`).join(' · '),
        variant: 'destructive',
      });
    } else {
      // Sucesso parcial — mostra ambos os toasts pra clareza.
      toast({
        title: `${successes.length} enviado(s), ${failures.length} falhou(aram)`,
        description: failures.map((f) => `${f.name}: ${f.reason}`).join(' · '),
        variant: 'destructive',
      });
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
    try {
      await deleteMut.mutateAsync(att.id);
    } catch (err) {
      toast({
        title: 'Falha ao excluir',
        description: extractApiMessage(err, att.filename),
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Paperclip className="size-4" />
            Anexos
          </h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {!readOnly && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Tipo do anexo
              </label>
              <Select
                value={docKind ?? undefined}
                onValueChange={(v) => setDocKind(v as AttachmentDocKind)}
              >
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Selecione o tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {allowedDocKinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ATTACHMENT_DOC_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple={docKind !== 'QUOTATION'} /* QUOTATION é sempre 1×1 */
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePick}
              disabled={uploadMut.isPending}
            >
              <Upload className="size-4" />
              {uploadMut.isPending ? 'Enviando…' : 'Adicionar'}
            </Button>
          </div>
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
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{a.filename}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {ATTACHMENT_DOC_LABELS[a.kind] ?? a.kind}
                  </span>
                  {/* Quando o anexo virou cotação, mostra qual fornecedor —
                      atende: "Os anexos não são vinculados com as cotações...
                      qual será a de qual?" */}
                  {a.quotation && (
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.quotation.isWinner
                          ? 'bg-success text-success-foreground'
                          : 'bg-primary/10 text-primary'
                      }`}
                      title={`Cotação ${a.quotation.isWinner ? '(vencedora) ' : ''}vinculada a este anexo.`}
                    >
                      {a.quotation.isWinner && '🏆 '}
                      Cotação: {a.quotation.supplierName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatSize(a.sizeBytes)} · {a.mimeType}
                  {a.quotation && (
                    <>
                      {' · '}
                      <span className="font-medium text-foreground">
                        R$ {Number(a.quotation.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreviewing(a)}
                  title="Visualizar"
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(a)}
                  title="Baixar"
                >
                  <Download className="size-4" />
                </Button>
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(a)}
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

      <AttachmentPreviewDialog
        attachment={previewing}
        onClose={() => setPreviewing(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir anexo"
        description={
          deleteTarget
            ? `Excluir o anexo "${deleteTarget.filename}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
