import { useEffect, useState } from 'react';
import { useRequestRevision, type PendingApproval } from '@/lib/approvals';
import { extractApiMessage } from '@/lib/api-errors';
import {
  QUOTATION_WAIVER_LABELS,
  type QuotationWaiverReason,
} from '@/lib/requisitions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  step: PendingApproval;
  onClose: () => void;
  /**
   * Dispensa de cotação ativa na requisição. Quando preenchida, o
   * diálogo mostra uma opção "Recusar a dispensa" como atalho — o
   * motivo é montado automaticamente e o backend limpa a dispensa.
   */
  waiver?: {
    reason: QuotationWaiverReason;
    note: string | null;
  } | null;
}

/**
 * Aprovador devolve a requisição/PC pro solicitante com pedido de
 * ajuste. Não é rejeição — o documento volta pra status REVISION e o
 * solicitante edita e ressubmete.
 *
 * Quando a requisição tem dispensa de cotação solicitada, o aprovador
 * pode escolher "Recusar a dispensa" — o sistema preenche o motivo,
 * limpa a dispensa e o solicitante volta a precisar anexar cotações.
 */
export function RequestRevisionDialog({ step, onClose, waiver }: Props) {
  const mut = useRequestRevision();
  const { toast } = useToast();
  const [mode, setMode] = useState<'waiver-rejected' | 'other'>(
    waiver ? 'waiver-rejected' : 'other',
  );
  const [reason, setReason] = useState('');

  // Quando a tela abre com `waiver` presente, sugere o motivo de recusa
  // já preenchido pra o aprovador só revisar/ajustar.
  useEffect(() => {
    if (mode === 'waiver-rejected' && waiver) {
      setReason(
        `Dispensa de cotação não aceita. Por favor, anexe as 3 cotações ` +
          `exigidas pela política antes de re-submeter.`,
      );
    } else if (mode === 'other') {
      setReason('');
    }
  }, [mode, waiver]);

  const isWaiverRejection = mode === 'waiver-rejected' && !!waiver;

  async function handleSubmit() {
    if (reason.trim().length < 5) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe ao menos 5 caracteres explicando o ajuste.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await mut.mutateAsync({
        stepId: step.id,
        reason: reason.trim(),
        clearQuotationWaiver: isWaiverRejection,
      });
      toast({
        title: isWaiverRejection
          ? 'Dispensa recusada'
          : 'Devolvido para revisão',
        description: isWaiverRejection
          ? `${step.requisition.number} — o solicitante vai precisar anexar as cotações.`
          : `${step.requisition.number} volta para o solicitante.`,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Falha ao registrar',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver para revisão</DialogTitle>
          <DialogDescription>
            {step.requisition.number} — {step.requisition.title}
          </DialogDescription>
        </DialogHeader>

        {waiver && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O que devolver
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                className="mt-1"
                name="revision-mode"
                checked={mode === 'waiver-rejected'}
                onChange={() => setMode('waiver-rejected')}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Recusar a dispensa de cotação
                </p>
                <p className="text-xs text-muted-foreground">
                  Motivo do solicitante:{' '}
                  <span className="font-medium">
                    {QUOTATION_WAIVER_LABELS[waiver.reason]}
                  </span>
                  {waiver.note ? ` — "${waiver.note}"` : ''}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                className="mt-1"
                name="revision-mode"
                checked={mode === 'other'}
                onChange={() => setMode('other')}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Outro motivo</p>
                <p className="text-xs text-muted-foreground">
                  Pedir ajuste em itens, conta, fornecedor, etc.
                </p>
              </div>
            </label>
          </div>
        )}

        {step.assignedApprover &&
          !waiver && (
            <span className="hidden" /> /* placeholder */
          )}

        <div className="space-y-1.5">
          <Label>
            {isWaiverRejection
              ? 'Mensagem ao solicitante (editável)'
              : 'Motivo do ajuste'}
          </Label>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isWaiverRejection
                ? undefined
                : 'Ex.: troque o fornecedor pelo X, ajuste a conta contábil…'
            }
          />
          <p className="text-xs text-muted-foreground">
            {isWaiverRejection ? (
              <>
                Ao confirmar, a dispensa é <strong>removida</strong> da
                requisição e o solicitante precisa anexar as cotações para
                re-submeter.
              </>
            ) : (
              <>
                O solicitante recebe o documento com este motivo e edita
                pra ressubmeter. A cadeia de aprovação reinicia.
              </>
            )}
          </p>
        </div>

        {step.assignedApprover &&
          /* O Decide já mostra esse banner, replicamos aqui pra dar coerência
             quando o admin devolve uma etapa de outro aprovador. */ null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || reason.trim().length < 5}
          >
            {mut.isPending
              ? 'Enviando…'
              : isWaiverRejection
                ? 'Recusar dispensa'
                : 'Devolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

