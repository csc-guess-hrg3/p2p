import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useDecideApproval, type PendingApproval } from '@/lib/approvals';
import { useAuth } from '@/lib/auth';
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

const ADMIN_OVERRIDE_MIN = 10;

/**
 * Diálogo de decisão — aprovar ou rejeitar uma etapa de aprovação.
 *
 * Dois modos:
 *   1) Aprovador titular: justificativa opcional na aprovação, obrigatória
 *      na rejeição.
 *   2) Admin override (admin que NÃO é o aprovador titular): justificativa
 *      obrigatória em qualquer decisão — fica registrada na auditoria
 *      como "Decisão por Administrador".
 */
export function DecideDialog({ step, approved, onClose }: Props) {
  const decide = useDecideApproval();
  const { toast } = useToast();
  const { user } = useAuth();
  const [comments, setComments] = useState('');

  const isAdmin = user?.profile === 'ADMIN';
  const isTitular = step.assignedApprover?.id === user?.id;
  const isOverride = isAdmin && !isTitular;
  // Aprovar a própria requisição também é um caso especial — admin pode,
  // mas tem que justificar. O front não tem o requesterId aqui (só o
  // requester.name), então mandamos sempre; o backend valida.
  const justificationRequired = isOverride || !approved;
  const tooShort = isOverride && comments.trim().length < ADMIN_OVERRIDE_MIN;

  async function handleConfirm() {
    if (justificationRequired && comments.trim().length === 0) {
      toast({
        title: 'Justificativa obrigatória',
        description: isOverride
          ? 'Como você não é o aprovador titular, escreva o motivo.'
          : 'Informe o motivo da rejeição.',
        variant: 'destructive',
      });
      return;
    }
    if (tooShort) {
      toast({
        title: 'Justificativa muito curta',
        description: `Escreva pelo menos ${ADMIN_OVERRIDE_MIN} caracteres explicando.`,
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

        {isOverride && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-foreground">
              <p className="font-medium text-warning">
                Decisão como Administrador
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                O aprovador desta etapa é{' '}
                <span className="font-semibold text-foreground">
                  {step.assignedApprover?.name ?? '—'}
                </span>
                . Ao confirmar, sua decisão substitui a dele e fica
                registrada na auditoria — por isso a justificativa é
                obrigatória.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="comments">
            {isOverride
              ? 'Justificativa do override'
              : approved
                ? 'Comentário (opcional)'
                : 'Motivo da rejeição'}
          </Label>
          <Textarea
            id="comments"
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={
              isOverride
                ? 'Ex.: Aprovador titular em férias até 02/06. Validado por telefone.'
                : undefined
            }
          />
          {isOverride && (
            <p className="text-[11px] text-muted-foreground">
              {tooShort
                ? `Mínimo ${ADMIN_OVERRIDE_MIN} caracteres — faltam ${
                    ADMIN_OVERRIDE_MIN - comments.trim().length
                  }.`
                : `${comments.trim().length} caracteres.`}
            </p>
          )}
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
