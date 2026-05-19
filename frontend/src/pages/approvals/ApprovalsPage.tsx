import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Check, X } from 'lucide-react';
import {
  usePendingApprovals,
  useDecideApproval,
  type PendingApproval,
} from '@/lib/approvals';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Diálogo de decisão — aprovar ou rejeitar uma etapa. */
function DecideDialog({
  step,
  approved,
  onClose,
}: {
  step: PendingApproval;
  approved: boolean;
  onClose: () => void;
}) {
  const decide = useDecideApproval();
  const [comments, setComments] = useState('');

  async function handleConfirm() {
    if (!approved && comments.trim().length === 0) {
      alert('Informe o motivo da rejeição.');
      return;
    }
    try {
      await decide.mutateAsync({
        stepId: step.id,
        approved,
        comments: comments.trim() || undefined,
      });
      onClose();
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      alert(msg || 'Não foi possível registrar a decisão.');
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

export function ApprovalsPage() {
  const navigate = useNavigate();
  const { data: steps = [], isLoading } = usePendingApprovals();
  const [decision, setDecision] = useState<{
    step: PendingApproval;
    approved: boolean;
  } | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? 'Carregando…'
          : `${steps.length} requisição(ões) aguardando sua decisão.`}
      </p>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && steps.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma aprovação pendente.
                </TableCell>
              </TableRow>
            )}
            {steps.map((s) => (
              <TableRow key={s.id}>
                <TableCell
                  className="cursor-pointer font-medium"
                  onClick={() =>
                    navigate(`/requisicoes/${s.requisition.id}`)
                  }
                >
                  {s.requisition.number}
                </TableCell>
                <TableCell>{s.requisition.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.requisition.requester?.name ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.levelName ?? `Nível ${s.level}`}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(s.requisition.totalAmount)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDecision({ step: s, approved: false })
                      }
                    >
                      <X className="size-4 text-destructive" />
                      Rejeitar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setDecision({ step: s, approved: true })}
                    >
                      <Check className="size-4" />
                      Aprovar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {decision && (
        <DecideDialog
          step={decision.step}
          approved={decision.approved}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  );
}
