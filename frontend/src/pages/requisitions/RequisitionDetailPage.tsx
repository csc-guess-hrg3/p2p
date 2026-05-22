import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  Pencil,
  Send,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import {
  useRequisition,
  useSubmitRequisition,
  useDeleteRequisition,
} from '@/lib/requisitions';
import { usePendingApprovals } from '@/lib/approvals';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { ConvertToPoDialog } from '@/pages/purchase-orders/ConvertToPoDialog';
import { FiscalClassifyDialog } from './FiscalClassifyDialog';
import { DecideDialog } from '@/pages/approvals/DecideDialog';
import { AttachmentsSection } from '@/components/AttachmentsSection';
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
  const { data: pendingApprovals = [] } = usePendingApprovals();
  const [convertOpen, setConvertOpen] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [decision, setDecision] = useState<{
    approved: boolean;
  } | null>(null);

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
  const needsFiscalClassification =
    req.status === 'APPROVED' &&
    req.tipoNotaFiscal !== 'SEM_NF' &&
    !fiscalReady;
  const canConvert =
    req.status === 'APPROVED' &&
    req.tipoNotaFiscal !== 'SEM_NF' &&
    fiscalReady;
  // Etapa de aprovação atribuída ao usuário logado para esta requisição.
  // Se houver, o aprovador pode decidir direto desta tela (sem voltar
  // à fila de Aprovações) — atalho importante para volumes maiores.
  const myPendingStep = pendingApprovals.find(
    (s) => s.requisition.id === req.id,
  );

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
        {/* Aprovador logado decide direto desta tela */}
        {myPendingStep && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setDecision({ approved: false })}
            >
              <X className="size-4 text-destructive" />
              Rejeitar
            </Button>
            <Button onClick={() => setDecision({ approved: true })}>
              <Check className="size-4" />
              Aprovar
            </Button>
          </div>
        )}
        {/*
          Botão no header só aparece quando a classificação já foi feita
          (caso de revisão). Quando ainda está pendente, o CTA fica no
          banner amarelo abaixo — evita duplicar a mesma ação.
        */}
        {canClassify && !myPendingStep && fiscalReady && (
          <Button variant="outline" onClick={() => setFiscalOpen(true)}>
            <ClipboardList className="size-4" />
            Revisar classificação fiscal
          </Button>
        )}
        {canConvert && (
          <Button onClick={() => setConvertOpen(true)}>
            <ShoppingCart className="size-4" />
            Converter em Pedido de Compra
          </Button>
        )}
      </div>

      {/*
        Banner pré-requisito de integração: requisição APROVADA mas sem
        CTB+natureza ainda. Como sem isso não dá pra gravar no Linx, vale
        a sinalização forte (cor de alerta + ícone + CTA do fiscal).
      */}
      {needsFiscalClassification && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-warning">
              Classificação fiscal não preenchida
            </p>
            <p className="text-sm text-muted-foreground">
              Antes de virar pedido de compra, esta requisição precisa de
              uma classificação fiscal e contábil.
              {isFiscal
                ? ' Clique em "Classificar fiscalmente" para preencher.'
                : ' Aguardando o fiscal preencher.'}
            </p>
          </div>
          {canClassify && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFiscalOpen(true)}
            >
              <ClipboardList className="size-4" />
              Classificar fiscalmente
            </Button>
          )}
        </div>
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
      {decision && myPendingStep && (
        <DecideDialog
          step={myPendingStep}
          approved={decision.approved}
          onClose={() => setDecision(null)}
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
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Field label="Tipo de compra" value={req.tipoCompra || '—'} />
          <Field
            label="Classificação fiscal"
            value={
              req.ctbTipoOperacao != null && req.naturezaEntrada
                ? `Operação ${req.ctbTipoOperacao} · Natureza ${req.naturezaEntrada}`
                : 'Não preenchida'
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

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="requisition"
            parentId={req.id}
            readOnly={['CONVERTED', 'CANCELLED'].includes(req.status)}
            hint="Cotações, contratos e documentos de apoio (PDF/DOCX/XLSX/imagens — até 10 MB cada, máx. 10)."
          />
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
