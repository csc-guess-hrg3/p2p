import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, ShoppingCart } from 'lucide-react';
import {
  useFundRequest,
  useFundRequestHistory,
  useRetryFundRequestErp,
} from '@/lib/fund-requests';
import { extractApiMessage } from '@/lib/api-errors';
import { useToast } from '@/components/ui/use-toast';
import { RotateCw } from 'lucide-react';
import { useSvSaldos } from '@/lib/financial';
import { useCompany } from '@/lib/company';
import { useAuth } from '@/lib/auth';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function FundRequestDetailPage() {
  const { id } = useParams();
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { data: sv, isLoading } = useFundRequest(id);
  const historyQ = useFundRequestHistory(id);
  const retryMut = useRetryFundRequestErp(id);
  const { toast } = useToast();
  // Pega saldo do Linx só quando a SV já foi integrada (tem número).
  // Antes disso, não faz sentido perguntar pro ERP.
  const saldoQ = useSvSaldos({
    companyId: activeCompany?.id,
    svs: sv?.erpSolicitacao ? [sv.erpSolicitacao] : [],
  });
  const saldo = sv?.erpSolicitacao
    ? saldoQ.data?.[sv.erpSolicitacao]
    : undefined;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!sv) {
    return (
      <p className="text-sm text-muted-foreground">
        Solicitação de verba não encontrada.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/solicitacoes-verba">
            <ArrowLeft className="size-4" />
            Solicitações de Verba
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{sv.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{sv.number}</p>
          </div>
          <StatusBadge status={sv.status} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Solicitante" value={sv.requester?.name ?? '—'} />
          <Field label="Criada em" value={formatDate(sv.createdAt)} />
          <Field label="Aprovada em" value={formatDate(sv.approvedAt)} />
          <Field
            label="Valor total"
            value={
              <span className="font-semibold">
                {formatCurrency(sv.totalAmount)}
              </span>
            }
          />
          {sv.erpSolicitacao && (
            <Field label="Nº da solicitação no Linx" value={sv.erpSolicitacao} />
          )}
          <div className="col-span-3 flex flex-wrap gap-2">
            {sv.requisition && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/requisicoes/${sv.requisition.id}`}>
                  <FileText className="size-4" />
                  Requisição {sv.requisition.number}
                </Link>
              </Button>
            )}
            {sv.purchaseOrder && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/pedidos/${sv.purchaseOrder.id}`}>
                  <ShoppingCart className="size-4" />
                  Pedido {sv.purchaseOrder.number}
                </Link>
              </Button>
            )}
          </div>
          {sv.status === 'REJECTED' && sv.rejectionReason && (
            <div className="col-span-3">
              <Field label="Motivo da rejeição" value={sv.rejectionReason} />
            </div>
          )}
          {/* Falha na gravação no Linx — mostra explicitamente em vez de
              só esconder o número da solicitação. O cron noturno (RN-FIN)
              vai reprocessar automaticamente. */}
          {!sv.erpSolicitacao && sv.lastErpError && (
            <div className="col-span-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium text-destructive">
                  Falha ao integrar com o Linx
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retryMut.isPending}
                  onClick={async () => {
                    try {
                      const r = await retryMut.mutateAsync();
                      toast({
                        title: 'SV integrada',
                        description: `Nº Linx: ${r.erpSolicitacao}`,
                        variant: 'success',
                      });
                    } catch (err) {
                      toast({
                        title: 'Reintegração falhou',
                        description: extractApiMessage(err),
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <RotateCw className="size-4" />
                  {retryMut.isPending ? 'Reintegrando…' : 'Reintegrar Linx'}
                </Button>
              </div>
              <div className="whitespace-pre-wrap break-words text-xs text-destructive/90">
                {sv.lastErpError}
              </div>
              {sv.lastErpAttemptAt && (
                <div className="text-xs text-muted-foreground">
                  Última tentativa em{' '}
                  {new Date(sv.lastErpAttemptAt).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saldo no Linx — só aparece quando a SV foi integrada e o
          financeiro registrou movimentações. Mostra quanto ainda há
          a entregar/realizar; quando zera, a SV está fechada. */}
      {sv.erpSolicitacao && saldo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saldo no Linx</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label="Solicitado"
                value={formatCurrency(saldo.totalSolicitado)}
              />
              <Field
                label="Saldo a realizar"
                value={
                  <span
                    className={
                      saldo.totalAPagar !== 0
                        ? 'font-semibold text-warning'
                        : 'font-semibold text-success'
                    }
                  >
                    {formatCurrency(Math.abs(saldo.totalAPagar))}
                    {saldo.totalAPagar === 0 ? ' (realizada)' : ''}
                  </span>
                }
              />
              <Field
                label="Itens"
                value={`${saldo.itens.length} parcela(s)`}
              />
            </div>
            {saldo.itens.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Solicitado</TableHead>
                    <TableHead className="text-right">A realizar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saldo.itens.map((it) => (
                    <TableRow key={it.idItem}>
                      <TableCell className="font-mono text-xs">
                        {it.idItem}
                      </TableCell>
                      <TableCell>{formatDate(it.vencimentoReal)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(it.valorSolicitado)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Math.abs(it.valorAPagarCalc))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Beneficiário</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Rateios</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sv.items ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {it.beneficiaryName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {it.accountingAccount}
                    {it.accountName ? ` — ${it.accountName}` : ''}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    F: {it.branchRateioCode} · CC: {it.costCenterRateioCode}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(it.dueDate)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(it.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="fundRequest"
            parentId={sv.id}
            // Anexo só pelo solicitante; demais visualizam.
            readOnly={
              ['CANCELLED'].includes(sv.status) ||
              user?.id !== sv.requester?.id
            }
            hint="Documentos de apoio para o adiantamento (PDF/DOCX/XLSX/imagens — até 10 MB cada, máx. 10)."
          />
        </CardContent>
      </Card>

      <HistoryTimeline events={historyQ.data} />
    </div>
  );
}
