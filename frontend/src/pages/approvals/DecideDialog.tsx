import { useState } from 'react';
import { useDecideApproval, type PendingApproval } from '@/lib/approvals';
import { extractApiMessage } from '@/lib/api-errors';
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
  approved: boolean;
  onClose: () => void;
}

/**
 * Diálogo de decisão — aprovar ou rejeitar uma etapa de aprovação.
 *
 * O diálogo só abre para o APROVADOR da etapa (a fila `pendingForUser` já
 * filtra por quem pode decidir — não há mais "override de admin" nem
 * aprovação do próprio documento). Justificativa é opcional na aprovação e
 * obrigatória na rejeição. Para decidir no lugar de outro aprovador, o admin
 * usa o modo Simulação e age na visão dele.
 */
export function DecideDialog({ step, approved, onClose }: Props) {
  const decide = useDecideApproval();
  const { toast } = useToast();
  const [comments, setComments] = useState('');

  const justificationRequired = !approved;

  async function handleConfirm() {
    if (justificationRequired && comments.trim().length === 0) {
      toast({
        title: 'Justificativa obrigatória',
        description: 'Informe o motivo da rejeição.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await decide.mutateAsync({
        stepId: step.id,
        approved,
        comments: comments.trim() || undefined,
      });
      toast({
        title: approved ? 'Aprovação registrada' : 'Rejeição registrada',
        description: `${step.requisition.number} — ${step.requisition.title}`,
        variant: approved ? 'success' : 'default',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Falha ao registrar decisão',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {approved ? 'Aprovar requisição' : 'Rejeitar requisição'}
          </DialogTitle>
          <DialogDescription>
            {step.requisition.number} — {step.requisition.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="comments">
            {approved ? 'Comentário (opcional)' : 'Motivo da rejeição'}
          </Label>
          <Textarea
            id="comments"
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={approved ? 'default' : 'destructive'}
            onClick={handleConfirm}
            disabled={decide.isPending}
          >
            {decide.isPending
              ? 'Registrando…'
              : approved
                ? 'Confirmar aprovação'
                : 'Confirmar rejeição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
