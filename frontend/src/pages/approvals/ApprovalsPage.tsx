import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Clock, Download, ExternalLink, Undo2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  usePendingApprovals,
  useMineWaitingApproval,
  type PendingApproval,
} from '@/lib/approvals';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
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
import { RequestRevisionDialog } from './RequestRevisionDialog';

/**
 * Tela de Aprovações com duas visões dependentes do perfil:
 *
 * - **Admin / Manager** (aprovador): lista de etapas que aguardam a
 *   decisão deles, com ações Aprovar / Rejeitar / Devolver para revisão.
 *
 * - **Operador** (solicitante): lista das próprias requisições que estão
 *   aguardando aprovação, com indicação de em qual nível paramos e quem
 *   é o aprovador atual — somente leitura.
 */
export function ApprovalsPage() {
  const { user } = useAuth();
  const isApprover =
    user?.profile === 'ADMIN' || user?.profile === 'MANAGER';
  return isApprover ? <ApproverView /> : <RequesterView />;
}

/* ------------------------------------------------------------------ */
/* Visão do APROVADOR (Admin / Manager)                                */
/* ------------------------------------------------------------------ */

function ApproverView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: steps = [], isLoading } = usePendingApprovals();
  const isAdmin = user?.profile === 'ADMIN';
  // Admin enxerga TODAS as aprovações pendentes da empresa — separamos
  // visualmente "as suas" (titular) das "demais" (overrides) pra ele
  // saber onde está agindo fora da alçada.
  const ownSteps = steps.filter((s) => s.assignedApprover?.id === user?.id);
  const overrideSteps = steps.filter(
    (s) => s.assignedApprover?.id && s.assignedApprover.id !== user?.id,
  );
  const pag = usePagination(steps);
  const [decision, setDecision] = useState<{
    step: PendingApproval;
    approved: boolean;
  } | null>(null);
  const [revisionStep, setRevisionStep] = useState<PendingApproval | null>(
    null,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Carregando…'
            : isAdmin
              ? `${steps.length} pendente(s) — ${ownSteps.length} sua(s) e ${overrideSteps.length} de outros aprovadores.`
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
                {isAdmin && <TableHead>Aprovador titular</TableHead>}
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && steps.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 7 : 6}
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
                    onClick={() => navigate(`/requisicoes/${s.requisition.id}`)}
                  >
                    <span className="inline-flex items-center gap-2">
                      {s.requisition.number}
                      {/* Aviso visual de dispensa de cotação — antes só
                          aparecia ao abrir o detalhe; aprovador agora
                          enxerga já na lista, com o motivo no tooltip. */}
                      {s.requisition.quotationWaiverReason && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning">
                              <AlertTriangle className="size-3" />
                              Dispensa
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="font-semibold">
                              Dispensa de cotação solicitada
                            </div>
                            <div>Motivo: {s.requisition.quotationWaiverReason}</div>
                            {s.requisition.quotationWaiverNote && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {s.requisition.quotationWaiverNote}
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{s.requisition.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.requisition.requester?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.levelName ?? `Nível ${s.level}`}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-muted-foreground">
                      {s.assignedApprover?.name ? (
                        s.assignedApprover.id === user?.id ? (
                          <span className="text-foreground">Você</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {s.assignedApprover.name}
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">
                              override
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </TableCell>
                  )}
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
                        onClick={() => setRevisionStep(s)}
                        title="Devolver para o solicitante ajustar"
                      >
                        <Undo2 className="size-4 text-warning" />
                        Devolver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecision({ step: s, approved: false })}
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
      {revisionStep && (
        <RequestRevisionDialog
          step={revisionStep}
          onClose={() => setRevisionStep(null)}
          waiver={
            revisionStep.requisition.quotationWaiverReason
              ? {
                  reason: revisionStep.requisition.quotationWaiverReason,
                  note: revisionStep.requisition.quotationWaiverNote ?? null,
                }
              : null
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visão do SOLICITANTE (Operador)                                     */
/* ------------------------------------------------------------------ */

function RequesterView() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useMineWaitingApproval();
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
        <Clock className="size-4 text-primary" />
        <span>
          {isLoading
            ? 'Carregando…'
            : `Suas requisições aguardando o(s) gestor(es) — ${rows.length} no total.`}
        </span>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aguardando</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Submetida em</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nenhuma requisição sua em aprovação no momento.
                  </TableCell>
                </TableRow>
              )}
              {pag.pageRows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/requisicoes/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.currentApprover?.name ? (
                      <span>
                        <span className="font-medium text-foreground">
                          {r.currentApprover.name}
                        </span>
                        {r.currentLevelName && (
                          <span className="ml-1 text-xs">
                            · {r.currentLevelName}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs italic">
                        cadeia ainda não iniciada
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.totalAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.submittedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/requisicoes/${r.id}`);
                      }}
                      title="Abrir requisição"
                    >
                      <ExternalLink className="size-4" />
                    </Button>
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
    </div>
  );
}
