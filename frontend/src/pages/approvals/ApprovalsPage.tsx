import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink, X } from 'lucide-react';
import {
  usePendingApprovals,
  type PendingApproval,
} from '@/lib/approvals';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DecideDialog } from './DecideDialog';

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
                      variant="ghost"
                      title="Ver detalhe"
                      onClick={() =>
                        navigate(`/requisicoes/${s.requisition.id}`)
                      }
                    >
                      <ExternalLink className="size-4" />
                    </Button>
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
