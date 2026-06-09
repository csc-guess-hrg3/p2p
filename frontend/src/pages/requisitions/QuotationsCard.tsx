import { useEffect, useState } from 'react';
import {
  Award,
  Building2,
  CheckCircle2,
  CircleAlert,
  Download,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { downloadAttachment, type Attachment } from '@/lib/attachments';
import { AttachmentPreviewDialog } from '@/components/AttachmentPreviewDialog';
import {
  useClearWinningQuotation,
  useDeleteQuotation,
  useSelectWinningQuotation,
  type Quotation,
} from '@/lib/quotations';
import { extractApiMessage } from '@/lib/api-errors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { QuotationDialog } from './QuotationDialog';
import type { Requisition } from '@/lib/requisitions';

interface Props {
  requisitionId: string;
  quotations: Quotation[];
  /** Aprovador (ou Admin) pode selecionar uma cotação como vencedora. */
  canSelect: boolean;
  /** Solicitante pode editar/excluir cotações (rascunho/revisão). */
  canEdit: boolean;
  /** Opcional — referência aos items da req pra editar via dialog. */
  requisitionForEdit?: Pick<Requisition, 'id' | 'items'>;
  /**
   * Esconde o botão "Adicionar cotação" do header. Usado quando o card
   * está DENTRO do formulário da requisição — lá o próprio form já provê
   * o botão (com auto-save do rascunho), evitando duplicidade.
   */
  hideAddButton?: boolean;
  /**
   * Proposta do solicitante = "Cotação 1" implícita. Recebe os dados da
   * própria req (supplier + total + items) pra renderizar no topo do
   * card, em pé de igualdade visual com as cotações alternativas.
   * Quando nenhuma alternativa foi marcada como vencedora, a "Proposta"
   * é a vigente — explica pro aprovador que "manter" = aceitar a original.
   */
  proposal?: {
    supplierName: string;
    supplierErpCode: string | null;
    supplierCnpj: string | null;
    paymentConditionDesc: string | null;
    totalAmount: string;
    itemsCount: number;
  };
}

function maskCnpj(d: string): string {
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Card listando as cotações de uma requisição.
 *
 * - Cards individuais com fornecedor (badge "cadastrado/não cadastrado"),
 *   CNPJ, condição, valor, número de itens.
 * - Cotação vencedora ganha banner verde "Vencedora" e botão "Ver detalhes".
 * - Aprovador (canSelect) vê botão "Selecionar como vencedora" em cada
 *   cotação não-vencedora.
 * - Solicitante (canEdit) vê Editar e Excluir.
 */
export function QuotationsCard({
  requisitionId,
  quotations,
  canSelect,
  canEdit,
  requisitionForEdit,
  hideAddButton,
  proposal,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const selectMut = useSelectWinningQuotation(requisitionId);
  const clearWinnerMut = useClearWinningQuotation(requisitionId);
  const deleteMut = useDeleteQuotation(requisitionId);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [creating, setCreating] = useState(false);
  // Diálogo de confirmação substituindo `confirm()` nativo — texto claro,
  // botões com label da ação real e estilo coerente com o resto do app.
  const [confirmSelect, setConfirmSelect] = useState<Quotation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Quotation | null>(null);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);

  async function doSelect(q: Quotation, reason: string) {
    try {
      await selectMut.mutateAsync({ id: q.id, reason });
      toast({
        title: 'Cotação selecionada como vencedora',
        description: `${q.supplierName} — ${formatCurrency(q.totalAmount)}. Requisição atualizada.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Falha ao selecionar',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
      throw err;
    }
  }

  async function doDelete(q: Quotation) {
    try {
      await deleteMut.mutateAsync(q.id);
      toast({ title: 'Cotação removida', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Falha ao excluir',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Cotações
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {proposal ? quotations.length + 1 : quotations.length}
            </span>
          </span>
          {canEdit && requisitionForEdit && !hideAddButton && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Adicionar cotação
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!proposal && quotations.length === 0 && (
          <p className="mb-1 text-sm text-muted-foreground">
            {canEdit && requisitionForEdit
              ? 'Nenhuma cotação cadastrada. Clique em "Adicionar cotação" — o formulário herda os itens da requisição e pede o PDF da proposta.'
              : 'Nenhuma cotação cadastrada.'}
          </p>
        )}
        <ul className="space-y-3">
          {/* Cotação 1 = proposta do solicitante. Mesma posição visual
              das demais (mesma <li>), com badge "Proposta do solicitante"
              e fundo neutro. Marcada como "vencedora atual" quando
              nenhuma alternativa foi selecionada. */}
          {proposal && (() => {
            const someoneElseIsWinner = quotations.some((q) => q.isWinner);
            const proposalIsCurrent = !someoneElseIsWinner;
            return (
              <li
                className={`rounded-md border p-3 ${
                  proposalIsCurrent ? 'border-success/40 bg-success/5' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {proposal.supplierName}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                        <FileText className="size-3" />
                        Cotação 1 · Proposta do solicitante
                      </span>
                      {proposalIsCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                          <Award className="size-3" />
                          Vencedora atual
                        </span>
                      )}
                    </div>
                    {proposal.supplierCnpj && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {maskCnpj(proposal.supplierCnpj)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {proposal.paymentConditionDesc
                        ? `Pgto: ${proposal.paymentConditionDesc}`
                        : 'Sem condição de pagamento informada'}{' '}
                      · {proposal.itemsCount} item(ns) ·{' '}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(proposal.totalAmount)}
                      </span>
                    </p>
                    <p className="text-[11px] italic text-muted-foreground">
                      Esta é a proposta do solicitante (fornecedor e valores
                      que ele escolheu na requisição). Aprovador pode
                      mantê-la ou trocar por uma alternativa abaixo.
                    </p>
                  </div>
                  {/* Botão "Restaurar proposta" só faz sentido quando uma
                      alternativa foi escolhida como vencedora — aí o
                      aprovador pode voltar atrás. Só aparece pro aprovador
                      (canSelect). */}
                  {canSelect && !proposalIsCurrent && (
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await clearWinnerMut.mutateAsync();
                            toast({
                              title: 'Proposta do solicitante restaurada',
                              description:
                                'Fornecedor e valores voltaram aos originais. Você pode escolher outra cotação se quiser.',
                              variant: 'success',
                            });
                          } catch (err) {
                            toast({
                              title: 'Falha ao restaurar',
                              description: extractApiMessage(err),
                              variant: 'destructive',
                            });
                          }
                        }}
                        disabled={clearWinnerMut.isPending}
                        title="Descarta a cotação vencedora atual e volta aos dados originais que o solicitante preencheu."
                      >
                        <Award className="size-4" />
                        {clearWinnerMut.isPending
                          ? 'Restaurando…'
                          : 'Restaurar proposta do solicitante'}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })()}
          {quotations.map((q) => {
            const isWinner = q.isWinner;
            const isMine = q.createdBy?.name && user?.name === q.createdBy.name;
            const showSelect = canSelect && !isWinner;
            const showEdit = canEdit && !isWinner && isMine;
            const showDelete = canEdit && !isWinner && isMine;
            return (
              <li
                key={q.id}
                className={`rounded-md border p-3 ${
                  isWinner ? 'border-success/40 bg-success/5' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{q.supplierName}</span>
                      {q.supplierErpCode ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                              <CheckCircle2 className="size-3" />
                              Fornecedor cadastrado · cód. {q.supplierErpCode}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Fornecedor já existe no Linx — o código exibido
                            é o CLIFOR. Quando esta cotação for selecionada
                            como vencedora, o pedido usa diretamente esse
                            cadastro.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                              <CircleAlert className="size-3" />
                              Fornecedor ainda não cadastrado
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Fornecedor não está no Linx. Se esta cotação
                            for selecionada como vencedora, o cadastro será
                            criado automaticamente — você não precisa fazer
                            nada manualmente.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {isWinner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                          <Award className="size-3" />
                          Vencedora
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {maskCnpj(q.supplierCnpj)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.paymentConditionDesc
                        ? `Pgto: ${q.paymentConditionDesc}`
                        : 'Sem condição de pagamento informada'}{' '}
                      · {q.items.length} item(ns) ·{' '}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(q.totalAmount)}
                      </span>
                    </p>
                    {q.notes && (
                      <p className="text-xs italic text-muted-foreground">
                        “{q.notes}”
                      </p>
                    )}
                    {isWinner && q.selectedBy && (
                      <p className="text-[11px] text-success">
                        Selecionada por {q.selectedBy.name}
                      </p>
                    )}
                    {isWinner && q.selectionReason && (
                      <p className="mt-1 rounded-md bg-success/10 px-2 py-1 text-[11px] text-success">
                        <span className="font-semibold">Justificativa:</span>{' '}
                        {q.selectionReason}
                      </p>
                    )}
                    {/* Anexo da cotação aparece AQUI dentro do card —
                        antes só na lista geral de anexos da requisição,
                        sem dizer "esse PDF é da cotação de fornecedor X".
                        Agora cada cotação carrega o próprio comprovante
                        visivelmente. */}
                    {q.attachment && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed bg-card px-2 py-1.5">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs font-medium">
                          {q.attachment.filename}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() =>
                            q.attachment && setPreviewAtt({
                              id: q.attachment.id,
                              filename: q.attachment.filename,
                              mimeType: q.attachment.mimeType,
                              sizeBytes: 0,
                              kind: 'QUOTATION',
                              createdAt: q.createdAt,
                            })
                          }
                          title="Visualizar anexo"
                        >
                          <FileText className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() =>
                            q.attachment &&
                            downloadAttachment({
                              id: q.attachment.id,
                              filename: q.attachment.filename,
                              mimeType: q.attachment.mimeType,
                              sizeBytes: 0,
                              kind: 'QUOTATION',
                              createdAt: q.createdAt,
                            })
                          }
                          title="Baixar"
                        >
                          <Download className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1">
                    {showSelect && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setConfirmSelect(q)}
                        disabled={selectMut.isPending}
                      >
                        <Award className="size-4" />
                        {/* Quando já tem vencedora setada, esse botão na
                            verdade TROCA. Comunicar a ação real evita o
                            "isso não pode ser desfeito" confuso. */}
                        {quotations.some((x) => x.isWinner)
                          ? 'Trocar vencedora'
                          : 'Selecionar vencedora'}
                      </Button>
                    )}
                    {showEdit && requisitionForEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(q)}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                    )}
                    {showDelete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(q)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabela compacta de itens */}
                {q.items.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-1 text-left font-medium">Item</th>
                          <th className="py-1 text-right font-medium">Qtde</th>
                          <th className="py-1 text-right font-medium">Unit.</th>
                          <th className="py-1 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.items.map((it) => (
                          <tr key={it.id} className="border-b last:border-b-0">
                            <td className="py-1">
                              {it.description}
                              {it.unit && ` (${it.unit})`}
                            </td>
                            <td className="py-1 text-right">
                              {formatNumber(it.quantity)}
                            </td>
                            <td className="py-1 text-right">
                              {formatCurrency(it.unitPrice)}
                            </td>
                            <td className="py-1 text-right font-medium">
                              {formatCurrency(it.totalPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {editing && requisitionForEdit && (
          <QuotationDialog
            requisition={requisitionForEdit}
            existing={editing}
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
          />
        )}

        {creating && requisitionForEdit && (
          <QuotationDialog
            requisition={requisitionForEdit}
            open={creating}
            onOpenChange={(o) => !o && setCreating(false)}
          />
        )}

        {/* Diálogo de seleção da vencedora — coleta JUSTIFICATIVA
            obrigatória (mín. 10 chars). Antes só pedia confirmação;
            agora exige texto explicando o porquê pra auditoria. */}
        <SelectWinnerDialog
          quotation={confirmSelect}
          isReplacing={quotations.some((x) => x.isWinner)}
          onClose={() => setConfirmSelect(null)}
          onConfirm={async (reason) => {
            if (confirmSelect) await doSelect(confirmSelect, reason);
          }}
        />

        <AttachmentPreviewDialog
          attachment={previewAtt}
          onClose={() => setPreviewAtt(null)}
        />

        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(v) => !v && setConfirmDelete(null)}
          title="Excluir cotação?"
          description={
            confirmDelete
              ? `A cotação de "${confirmDelete.supplierName}" no valor de ${formatCurrency(confirmDelete.totalAmount)} será removida.`
              : null
          }
          confirmLabel="Excluir"
          variant="destructive"
          onConfirm={async () => {
            if (confirmDelete) await doDelete(confirmDelete);
          }}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Diálogo de seleção da cotação vencedora — exige justificativa.
 *
 * Por que existe (em vez de só usar ConfirmDialog): a usuária pediu
 * pra registrar POR QUE a cotação foi escolhida (RN-REQ-02, auditoria).
 * O backend rejeita selectAsWinner se reason.length < 10. Validamos
 * também aqui no front pro feedback ser imediato.
 */
interface SelectWinnerDialogProps {
  quotation: Quotation | null;
  isReplacing: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

function SelectWinnerDialog({
  quotation,
  isReplacing,
  onClose,
  onConfirm,
}: SelectWinnerDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const open = !!quotation;

  // Reset do textarea sempre que abre um diálogo novo.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const tooShort = reason.trim().length < 10;

  async function handleConfirm() {
    if (tooShort) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReplacing ? 'Trocar cotação vencedora' : 'Selecionar cotação vencedora'}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">
            {quotation && (
              <>
                Você está escolhendo:
                {'\n'}
                {'\n'}• {quotation.supplierName}
                {'\n'}• {formatCurrency(quotation.totalAmount)}
                {'\n'}• {quotation.items.length} item(ns)
                {'\n'}
                {'\n'}Fornecedor, condição de pagamento, itens e valor da
                requisição serão atualizados. Você pode trocar depois.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="selection-reason">
            Justificativa da escolha <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="selection-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: menor prazo de entrega, única com garantia de 12 meses, fornecedor recorrente com bom histórico…"
            rows={3}
            disabled={busy}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Mínimo 10 caracteres. Aparece no histórico da requisição.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={busy || tooShort}
            title={tooShort ? 'Informe pelo menos 10 caracteres.' : undefined}
          >
            {busy
              ? 'Processando…'
              : isReplacing
                ? 'Trocar'
                : 'Selecionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
