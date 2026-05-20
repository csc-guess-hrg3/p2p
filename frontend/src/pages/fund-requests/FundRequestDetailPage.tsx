import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, ShoppingCart } from 'lucide-react';
import { useFundRequest } from '@/lib/fund-requests';
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
  const { data: sv, isLoading } = useFundRequest(id);

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
        <CardContent className="grid grid-cols-3 gap-4">
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
            <Field label="Solicitação no ERP" value={sv.erpSolicitacao} />
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
        </CardContent>
      </Card>

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
            readOnly={['CANCELLED'].includes(sv.status)}
            hint="Documentos de apoio para o adiantamento (PDF/DOCX/XLSX/imagens — até 10 MB cada, máx. 10)."
          />
        </CardContent>
      </Card>
    </div>
  );
}
