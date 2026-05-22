import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useRequestRevision, type PendingApproval } from '@/lib/approvals';
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
}

/**
 * Aprovador devolve a requisição/PC pro solicitante com pedido de
 * ajuste. Não é rejeição — o documento volta pra status REVISION e o
 * solicitante edita e ressubmete.
 */
export function RequestRevisionDialog({ step, onClose }: Props) {
  const mut = useRequestRevision();
  const { toast } = useToast();
  const [reason, setReason] = useState('');

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
      await mut.mutateAsync({ stepId: step.id, reason: reason.trim() });
      toast({
        title: 'Devolvido para revisão',
        description: `${step.requisition.number} volta para o solicitante.`,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao registrar',
        description: msg || 'Tente novamente.',
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
        <div className="space-y-1.5">
          <Label>Motivo do ajuste</Label>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: troque o fornecedor pelo X, ajuste a conta contábil…"
          />
          <p className="text-xs text-muted-foreground">
            O solicitante recebe o documento com este motivo e edita pra
            ressubmeter. A cadeia de aprovação reinicia.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || reason.trim().length < 5}
          >
            {mut.isPending ? 'Enviando…' : 'Devolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
