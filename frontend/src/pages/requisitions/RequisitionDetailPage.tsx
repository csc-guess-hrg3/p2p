import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  Pencil,
  Send,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import {
  useRequisition,
  useSubmitRequisition,
  useDeleteRequisition,
} from '@/lib/requisitions';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { ConvertToPoDialog } from '@/pages/purchase-orders/ConvertToPoDialog';
import { FiscalClassifyDialog } from './FiscalClassifyDialog';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function RequisitionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: req, isLoading } = useRequisition(id);
  const submitMut = useSubmitRequisition();
  const deleteMut = useDeleteRequisition();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [convertOpen, setConvertOpen] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!req) {
    return <p className="text-sm text-muted-foreground">Requisição não encontrada.</p>;
  }

  const isDraft = req.status === 'DRAFT';
  const isFiscal = user?.profile === 'REVIEWER' || user?.profile === 'ADMIN';
  const canClassify = isFiscal && req.status !== 'CONVERTED';
  const fiscalReady = req.ctbTipoOperacao != null && !!req.naturezaEntrada;
  const canConvert =
    req.status === 'APPROVED' &&
    req.tipoNotaFiscal !== 'SEM_NF' &&
    fiscalReady;

  async function handleSubmit() {
    if (!req) return;
    if (!confirm('Submeter a requisição para aprovação?')) return;
    try {
      await submitMut.mutateAsync(req.id);
    } catch {
      alert('Não foi possível submeter a requisição.');
    }
  }

  async function handleDelete() {
    if (!req) return;
    if (!confirm('Excluir esta requisição em rascunho?')) return;
    try {
      await deleteMut.mutateAsync(req.id);
      navigate('/requisicoes');
    } catch {
      alert('Não foi possível excluir a requisição.');
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/requisicoes">
            <ArrowLeft className="size-4" />
            Requisições
          </Link>
        </Button>
        {isDraft && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to={`/requisicoes/${req.id}/editar`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="size-4 text-destructive" />
              Excluir
            </Button>
            <Button onClick={handleSubmit} disabled={submitMut.isPending}>
              <Send className="size-4" />
              {submitMut.isPending ? 'Enviando…' : 'Submeter'}
            </Button>
          </div>
        )}
        {canClassify && (
          <Button variant="outline" onClick={() => setFiscalOpen(true)}>
            <ClipboardList className="size-4" />
            {fiscalReady ? 'Revisar classificação fiscal' : 'Classificar fiscalmente'}
          </Button>
        )}
        {canConvert && (
          <Button onClick={() => setConvertOpen(true)}>
            <ShoppingCart className="size-4" />
            Converter em Pedido de Compra
          </Button>
        )}
      </div>

      {req.status === 'APPROVED' &&
        req.tipoNotaFiscal !== 'SEM_NF' &&
        !fiscalReady && (
          <p className="text-sm text-warning">
            Aguardando classificação fiscal (CTB + natureza) para converter em PC.
          </p>
        )}

      {canConvert && (
        <ConvertToPoDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          requisition={req}
        />
      )}
      {fiscalOpen && activeCompany && (
        <FiscalClassifyDialog
          open={fiscalOpen}
          onOpenChange={setFiscalOpen}
          requisition={req}
          companyCode={activeCompany.code}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{req.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{req.number}</p>
          </div>
          <StatusBadge status={req.status} />
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Field label="Filial" value={req.branchName} />
          <Field label="Fornecedor" value={req.supplierName} />
          <Field
            label="Com adiantamento"
            value={req.tipoNotaFiscal === 'NF_FUTURA' ? 'Sim' : 'Não'}
          />
          <Field label="Solicitante" value={req.requester?.name ?? '—'} />
          <Field label="Criada em" value={formatDate(req.createdAt)} />
          <Field
            label="Condição de pagamento"
            value={
              req.paymentConditionDesc
                ? `${req.paymentConditionCode} — ${req.paymentConditionDesc}`
                : '—'
            }
          />
          <Field
            label="Recorrência"
            value={
              req.recurring
                ? `A cada ${req.recurrenceMonths ?? '?'} mês(es)`
                : 'Não recorrente'
            }
          />
          <Field label="Contrato vinculado" value={req.contractRef || '—'} />
          <Field label="Tipo de compra (Linx)" value={req.tipoCompra || '—'} />
          <Field
            label="Classificação fiscal"
            value={
              req.ctbTipoOperacao != null && req.naturezaEntrada
                ? `CTB ${req.ctbTipoOperacao} · Natureza ${req.naturezaEntrada}`
                : 'Não classificada'
            }
          />
          <Field
            label="Valor total"
            value={
              <span className="font-semibold">
                {formatCurrency(req.totalAmount)}
              </span>
            }
          />
          <div className="col-span-3">
            <Field label="Justificativa" value={req.justification ?? '—'} />
          </div>
          {req.status === 'REJECTED' && req.rejectionReason && (
            <div className="col-span-3">
              <Field
                label="Motivo da rejeição"
                value={req.rejectionReason}
              />
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
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead className="text-right">Preço est.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Rateios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(req.items ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.itemDescription}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(it.quantity)}
                  </TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(it.estimatedPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(it.totalPrice)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {it.accountingAccount}
                    {it.accountName ? ` — ${it.accountName}` : ''}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    F: {it.branchRateioCode} · CC: {it.costCenterRateioCode}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {req.approvalSteps && req.approvalSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de aprovação</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nível</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decidido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {req.approvalSteps.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.level}</TableCell>
                    <TableCell>{s.levelName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(s.decidedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
