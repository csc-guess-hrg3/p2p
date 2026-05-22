import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Download, ExternalLink, X } from 'lucide-react';
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
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/lib/use-pagination';
import { exportToCsv } from '@/lib/csv';
import { DecideDialog } from './DecideDialog';

export function ApprovalsPage() {
  const navigate = useNavigate();
  const { data: steps = [], isLoading } = usePendingApprovals();
  const pag = usePagination(steps);
  const [decision, setDecision] = useState<{
    step: PendingApproval;
    approved: boolean;
  } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Carregando…'
            : `${steps.length} requisição(ões) aguardando sua decisão.`}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(
              `aprovacoes-pendentes-${new Date().toISOString().slice(0, 10)}`,
              [
                {
                  header: 'Número da requisição',
                  value: (s) => s.requisition.number,
                },
                { header: 'Título', value: (s) => s.requisition.title },
                {
                  header: 'Solicitante',
                  value: (s) => s.requisition.requester?.name ?? '',
                },
                {
                  header: 'Nível',
                  value: (s) => s.levelName ?? `Nível ${s.level}`,
                },
                {
                  header: 'Valor',
                  value: (s) => s.requisition.totalAmount,
                },
              ],
              steps,
            )
          }
          disabled={steps.length === 0}
        >
          <Download className="size-4" />
          Exportar
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
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
            {pag.pageRows.map((s) => (
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
        <Pagination
          page={pag.page}
          pageSize={pag.pageSize}
          total={pag.total}
          totalPages={pag.totalPages}
          onPageChange={pag.setPage}
          onPageSizeChange={pag.setPageSize}
        />
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
