import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  QUOTATION_WAIVER_LABELS,
  QUOTATION_WAIVER_MIN_NOTE,
  QUOTATION_WAIVER_REASONS,
  useSetQuotationWaiver,
  type QuotationWaiverReason,
} from '@/lib/requisitions';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  requisitionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Pré-seleciona o motivo (ex.: vem de uma requisição com `recurring=true`,
   * já sugerimos RECORRENTE). O usuário pode trocar.
   */
  suggestedReason?: QuotationWaiverReason;
  /** Texto sugerido pra justificativa (ex.: vínculo com PO anterior). */
  suggestedNote?: string;
}

/**
 * Diálogo para solicitar dispensa de cotação (RN-REQ-02 — exceção).
 *
 * O solicitante escolhe um motivo tipado + escreve a justificativa
 * (mín. 20 chars). Ao salvar, a requisição fica marcada com a dispensa
 * e o submit não exige mais o mínimo de cotações anexadas — o aprovador
 * verá motivo + justificativa na tela de aprovação e decide se aceita.
 */
export function QuotationWaiverDialog({
  requisitionId,
  open,
  onOpenChange,
  suggestedReason,
  suggestedNote,
}: Props) {
  const { toast } = useToast();
  const mut = useSetQuotationWaiver(requisitionId);
  const [reason, setReason] = useState<QuotationWaiverReason>(
    suggestedReason ?? 'RECORRENTE',
  );
  const [note, setNote] = useState(suggestedNote ?? '');

  useEffect(() => {
    if (open) {
      setReason(suggestedReason ?? 'RECORRENTE');
      setNote(suggestedNote ?? '');
    }
  }, [open, suggestedReason, suggestedNote]);

  const tooShort = note.trim().length < QUOTATION_WAIVER_MIN_NOTE;
  const remaining = Math.max(0, QUOTATION_WAIVER_MIN_NOTE - note.trim().length);

  async function handleSave() {
    try {
      await mut.mutateAsync({ reason, note: note.trim() });
      toast({
        title: 'Dispensa solicitada',
        description: `Motivo: ${QUOTATION_WAIVER_LABELS[reason]} — aguardando aprovador validar.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Não foi possível registrar a dispensa',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-warning" />
            Solicitar dispensa de cotação
          </DialogTitle>
          <DialogDescription>
            Quando a compra tem motivo legítimo para fugir da regra de 3
            cotações, escolha o motivo e explique brevemente. O aprovador
            vai ver a explicação junto com a requisição e decide se aceita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as QuotationWaiverReason)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUOTATION_WAIVER_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {QUOTATION_WAIVER_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              <strong>Contrato vigente:</strong> fornecedor já cotado quando
              o contrato foi assinado.{' '}
              <strong>Recorrente:</strong> compra de mesma natureza com
              fornecedor histórico.{' '}
              <strong>Fornecedor único:</strong> só uma empresa fornece o
              item. <strong>Emergência:</strong> risco de continuidade que
              não comporta espera.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waiver-note">Justificativa</Label>
            <Textarea
              id="waiver-note"
              rows={4}
              placeholder="Explique por que a dispensa se aplica. Exemplo: 'Contrato mensal com Limpa Vidros Ltda desde jan/2024 — referência PO-2025-08-0142, mesma natureza dos últimos 12 meses, sem variação de escopo nem preço.'"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo {QUOTATION_WAIVER_MIN_NOTE} caracteres
              {tooShort
                ? ` — faltam ${remaining}.`
                : ` — ${note.trim().length} preenchidos.`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={mut.isPending || tooShort}>
            {mut.isPending ? 'Salvando…' : 'Solicitar dispensa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
