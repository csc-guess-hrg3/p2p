import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { extractApiMessage } from '@/lib/api-errors';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  Pencil,
  Send,
  ShoppingCart,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  useRequisition,
  useRequisitionHistory,
  useSubmitRequisition,
  useResubmitRequisition,
  useDeleteRequisition,
  useCloneRequisition,
} from '@/lib/requisitions';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { RequisitionProgress } from '@/components/RequisitionProgress';
import { PendingFiscalCard } from '@/components/PendingFiscalCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePendingApprovals } from '@/lib/approvals';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { ConvertToPoDialog } from '@/pages/purchase-orders/ConvertToPoDialog';
import { FiscalClassifyDialog } from './FiscalClassifyDialog';
import { DecideDialog } from '@/pages/approvals/DecideDialog';
import { RequestRevisionDialog } from '@/pages/approvals/RequestRevisionDialog';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { QuotationsWarning } from '@/components/QuotationsWarning';
import { QuotationWaiverDialog } from './QuotationWaiverDialog';
import { QuotationDialog } from './QuotationDialog';
import { QuotationsCard } from './QuotationsCard';
import { useAttachments, type Attachment } from '@/lib/attachments';
import { useClearQuotationWaiver } from '@/lib/requisitions';
import { useQuotations } from '@/lib/quotations';
import { useQuotationsPolicy } from '@/lib/admin';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
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
  const historyQ = useRequisitionHistory(id);
  const submitMut = useSubmitRequisition();
  const resubmitMut = useResubmitRequisition();
  // Contagem real de cotações (anexos do tipo QUOTATION) — fonte da
  // verdade para o banner da RN-REQ-02.
  const { data: attachments = [] } = useAttachments('requisition', id);
  const quotationsCount = attachments.filter(
    (a) => a.kind === 'QUOTATION',
  ).length;
  const deleteMut = useDeleteRequisition();
  const cloneMut = useCloneRequisition();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const { data: pendingApprovals = [] } = usePendingApprovals();
  const [convertOpen, setConvertOpen] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmResubmit, setConfirmResubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quotationAttachment, setQuotationAttachment] =
    useState<Attachment | null>(null);
  const { data: quotations = [] } = useQuotations(id);
  const clearWaiverMut = useClearQuotationWaiver(id);
  const [decision, setDecision] = useState<{
    approved: boolean;
  } | null>(null);
  // IMPORTANTE: hook chamado ANTES dos early returns abaixo — em React
  // a ordem dos hooks tem que ser estável entre renders. Passa `req?.companyId`
  // (undefined enquanto carrega) e o próprio hook lida com `enabled`.
  const policy = useQuotationsPolicy(req?.companyId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!req) {
    return <p className="text-sm text-muted-foreground">Requisição não encontrada.</p>;
  }

  const isDraft = req.status === 'DRAFT';
  const isRevision = req.status === 'REVISION';
  // Em REVISION a UI mostra Editar + Re-submeter (sem Excluir) — o ciclo
  // de devolução pelo aprovador. Validação de cotações roda no resubmit
  // e no save da edição.
  const canEdit = isDraft || isRevision;

  // Política de cotações — espelha a mesma checagem que o backend faz
  // no submit/resubmit. Se a req atinge o threshold e não tem nem o
  // mínimo de cotações nem dispensa, bloqueamos o botão ANTES da chamada
  // pra evitar BadRequest + dar feedback visual claro (o banner amarelo
  // já mostra o "faltam X cotações").
  // RN-REQ-02: política exige `minRequired` cotações no TOTAL. A
  // proposta do solicitante (fornecedor + itens da req) já conta como 1,
  // então o que faltam são `minRequired - 1` cotações ALTERNATIVAS.
  const blockedByQuotations =
    !!policy &&
    policy.thresholdAmount > 0 &&
    policy.minRequired > 0 &&
    Number(req.totalAmount) >= policy.thresholdAmount &&
    !req.quotationWaiverReason &&
    quotationsCount + 1 < policy.minRequired;
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

  async function doSubmit() {
    if (!req) return;
    try {
      await submitMut.mutateAsync(req.id);
      toast({
        title: 'Requisição submetida',
        description: 'Encaminhada para a próxima alçada de aprovação.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Não foi possível submeter',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
      throw err;
    }
  }

  async function doResubmit() {
    if (!req) return;
    try {
      await resubmitMut.mutateAsync(req.id);
      toast({
        title: 'Requisição re-submetida',
        description: 'A cadeia de aprovação foi reiniciada do nível 1.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Não foi possível re-submeter',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
      throw err;
    }
  }

  async function handleClone() {
    if (!req) return;
    try {
      const cloned = await cloneMut.mutateAsync(req.id);
      toast({
        title: `Requisição duplicada como ${cloned.number}`,
        description: 'Ajuste os dados e submeta como uma nova requisição.',
        variant: 'success',
      });
      navigate(`/requisicoes/${cloned.id}/editar`);
    } catch (err) {
      toast({
        title: 'Falha ao duplicar',
        description: extractApiMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    }
  }

  async function doDelete() {
    if (!req) return;
    try {
      await deleteMut.mutateAsync(req.id);
      navigate('/requisicoes');
    } catch (err) {
      toast({
        title: 'Não foi possível excluir',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
      throw err;
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/requisicoes">
            <ArrowLeft className="size-4" />
            Requisições
          </Link>
        </Button>
        {/*
          Wrapper único pra todas as ações da requisição — antes cada
          bloco tinha sua div separada, e o `justify-between` espalhava
          os botões em grupos isolados ("3 botões soltos"). Agora o
          back-button fica à esquerda e TODAS as ações se agrupam à
          direita, com hierarquia visual clara: outline = secundária,
          default = primária.
        */}
        <div className="flex flex-wrap gap-2">
          {/* "Duplicar" só faz sentido pro solicitante da requisição original
              — é ação de criação de nova req baseada em uma anterior. Pro
              aprovador/fiscal/comprador o botão polui sem propósito. */}
          {user && user.id === req.requester?.id && (
            <Button
              variant="outline"
              onClick={handleClone}
              disabled={cloneMut.isPending}
            >
              <Copy className="size-4" />
              {cloneMut.isPending ? 'Duplicando…' : 'Duplicar'}
            </Button>
          )}
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
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="size-4 text-destructive" />
              Excluir
            </Button>
            <Button
              onClick={() => setConfirmSubmit(true)}
              disabled={submitMut.isPending || blockedByQuotations}
              title={
                blockedByQuotations
                  ? 'Anexe as cotações ou solicite a dispensa antes de submeter'
                  : undefined
              }
            >
              <Send className="size-4" />
              {submitMut.isPending ? 'Enviando…' : 'Submeter'}
            </Button>
          </div>
        )}
        {isRevision && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to={`/requisicoes/${req.id}/editar`}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
            <Button
              onClick={() => setConfirmResubmit(true)}
              disabled={resubmitMut.isPending || blockedByQuotations}
              title={
                blockedByQuotations
                  ? 'Anexe as cotações ou solicite a dispensa antes de re-submeter'
                  : undefined
              }
            >
              <Send className="size-4" />
              {resubmitMut.isPending ? 'Enviando…' : 'Re-submeter'}
            </Button>
          </div>
        )}
        {/* Aprovador logado (ou admin em override) decide direto desta tela.
            Inclui "Devolver para revisão" — atalho importante quando há
            ajuste a pedir, sem precisar voltar à fila de Aprovações. */}
        {myPendingStep && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRevisionOpen(true)}
            >
              <Undo2 className="size-4" />
              Devolver
            </Button>
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
        {/* Atalhos pros PCs já gerados — apareceriam mesmo na req
            CONVERTED ou em qualquer status onde houver PO vinculado. */}
        {req.purchaseOrders && req.purchaseOrders.length > 0 && (
          <div className="flex gap-2">
            {req.purchaseOrders.map((po) => (
              <Button key={po.id} variant="outline" asChild>
                <Link to={`/pedidos/${po.id}`}>
                  <ShoppingCart className="size-4" />
                  Ir para {po.number}
                </Link>
              </Button>
            ))}
          </div>
        )}
        </div>
      </div>

      {/*
        Banner de devolução em destaque NO TOPO — antes ficava enterrado no
        rodapé do card de capa (depois da justificativa) e o solicitante nem
        via que a req tinha voltado. Agora é a primeira coisa na tela.
      */}
      {req.status === 'REVISION' && req.revisionReason && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <Undo2 className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-warning">
              Devolvida para revisão
            </p>
            <p className="whitespace-pre-line text-sm font-medium">
              {req.revisionReason}
            </p>
            <p className="text-xs text-muted-foreground">
              Edite a requisição e ressubmeta — o fluxo de aprovação reinicia.
            </p>
          </div>
        </div>
      )}

      {canEdit && (
        <QuotationWaiverDialog
          requisitionId={req.id}
          open={waiverOpen}
          onOpenChange={setWaiverOpen}
          suggestedReason={req.recurring ? 'RECORRENTE' : undefined}
        />
      )}

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
      {revisionOpen && myPendingStep && (
        <RequestRevisionDialog
          step={myPendingStep}
          onClose={() => setRevisionOpen(false)}
          waiver={
            req.quotationWaiverReason
              ? {
                  reason: req.quotationWaiverReason,
                  note: req.quotationWaiverNote,
                }
              : null
          }
        />
      )}

      {/*
        Cotações em destaque ANTES da capa quando há cotações na req.
        Antes ficava lá embaixo e o aprovador frequentemente decidia
        sem nem perceber que tinha cotações pra escolher (queixa direta
        da usuária). Agora vira primeiro card depois do header.

        Callout adicional quando o aprovador logado tem step pendente:
        "escolha uma cotação vencedora antes de aprovar" — deixa CLARA
        a relação entre o botão Aprovar (lá em cima) e a escolha da
        cotação aqui (que atualiza fornecedor/valor da requisição).
      */}
      {quotations.length > 0 && (
        <>
          {myPendingStep && !quotations.some((q) => q.isWinner) && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex items-start gap-3 pt-6">
                <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-semibold text-primary">
                    Escolha a cotação vencedora antes de aprovar
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Há {quotations.length} cotação(ões) anexada(s). Ao
                    selecionar uma vencedora, o fornecedor, condição de
                    pagamento e valor da requisição são atualizados com
                    os dados dela. Depois disso, use o botão "Aprovar"
                    no topo da tela.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <QuotationsCard
            requisitionId={req.id}
            quotations={quotations}
            // Selecionar a vencedora é decisão DO APROVADOR — não do
            // solicitante. Aprovador da etapa pendente OU Admin (override).
            // Antes operador via o botão e levava 403 ao clicar.
            canSelect={
              !isDraft &&
              req.status !== 'CONVERTED' &&
              req.status !== 'CANCELLED' &&
              (!!myPendingStep || user?.profile === 'ADMIN')
            }
            canEdit={canEdit}
            requisitionForEdit={req}
            // Proposta do solicitante = Cotação 1 implícita. Renderizada
            // no topo do card pra que o aprovador veja todas as cotações
            // (original + alternativas) no MESMO campo de decisão.
            proposal={{
              supplierName: req.supplierName,
              supplierErpCode: req.supplierErpCode ?? null,
              supplierCnpj: req.supplierCnpj ?? null,
              paymentConditionDesc: req.paymentConditionDesc ?? null,
              totalAmount: req.totalAmount,
              itemsCount: req.items?.length ?? 0,
            }}
          />
        </>
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

      {/*
        Aviso de política de cotações posicionado LOGO ACIMA dos anexos —
        é onde o solicitante anexa as cotações, então o aviso fica colado
        na ação que ele precisa tomar (queixa direta da usuária de que o
        aviso aparecia longe do campo de anexos).
      */}
      {canEdit && (
        <QuotationsWarning
          companyId={req.companyId}
          totalAmount={Number(req.totalAmount)}
          quotationsCount={quotationsCount}
          waiverReason={req.quotationWaiverReason}
          waiverNote={req.quotationWaiverNote}
          showWhenOk
          onRequestWaiver={() => setWaiverOpen(true)}
          onClearWaiver={async () => {
            try {
              await clearWaiverMut.mutateAsync();
              toast({
                title: 'Dispensa removida',
                description: 'A regra padrão de cotações volta a valer.',
                variant: 'success',
              });
            } catch (err) {
              toast({
                title: 'Falha ao remover dispensa',
                description: extractApiMessage(err),
                variant: 'destructive',
              });
            }
          }}
        />
      )}
      {/* Para requisições já submetidas/aprovadas, mostramos a dispensa
          como info read-only — o aprovador precisa ver o motivo. */}
      {!canEdit && req.quotationWaiverReason && (
        <QuotationsWarning
          companyId={req.companyId}
          totalAmount={Number(req.totalAmount)}
          quotationsCount={quotationsCount}
          waiverReason={req.quotationWaiverReason}
          waiverNote={req.quotationWaiverNote}
        />
      )}

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="requisition"
            parentId={req.id}
            // Só o solicitante adiciona/exclui anexos. Aprovador,
            // revisor e admin vêem mas não mexem — quem precisar
            // anexar pede pro solicitante editar a requisição.
            // Também trava em status terminal (já tinha).
            readOnly={
              ['CONVERTED', 'CANCELLED'].includes(req.status) ||
              user?.id !== req.requester?.id
            }
            hint="Cotações, contratos e documentos de apoio (PDF/DOCX/XLSX/imagens — até 10 MB cada, máx. 10)."
            allowedDocKinds={['QUOTATION', 'CONTRACT', 'INVOICE', 'OTHER']}
            // Sem defaultDocKind → mostra "Selecione o tipo…" obrigatório.
            // O upload exige escolha consciente entre cotação/contrato/etc.
            onQuotationUploaded={(att) => setQuotationAttachment(att)}
            // Os anexos QUE JÁ VIRARAM cotação aparecem dentro do
            // card da cotação correspondente (com o nome do
            // fornecedor) — não polui a lista geral aqui.
            hideLinkedQuotations
          />
        </CardContent>
      </Card>

      {/* QuotationsCard agora renderiza ANTES da capa (com callout pro
          aprovador). Mantida apenas a referência ao QuotationDialog
          para upload de cotação a partir de anexo. */}

      {quotationAttachment && (
        <QuotationDialog
          requisition={req}
          attachmentId={quotationAttachment.id}
          open={!!quotationAttachment}
          onOpenChange={(o) => !o && setQuotationAttachment(null)}
        />
      )}

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
                  <TableHead>Aprovador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decidido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {req.approvalSteps.map((s) => {
                  // Pendente: mostra o aprovador esperado (cargo). Decidido:
                  // mostra quem de fato decidiu (pode ser delegado).
                  const isPending = s.status === 'PENDING';
                  const who = isPending
                    ? s.assignedApproverName
                    : s.decidedByName;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.level}</TableCell>
                      <TableCell>{s.levelName ?? '—'}</TableCell>
                      <TableCell>
                        {who ? (
                          <span
                            className={
                              isPending ? 'text-muted-foreground italic' : ''
                            }
                          >
                            {who}
                            {isPending && ' (aguardando)'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(s.decidedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RequisitionProgress req={req} />

      <PendingFiscalCard items={req.pendingFiscalItems} />

      <HistoryTimeline events={historyQ.data} />

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submeter para aprovação?"
        description="A requisição entra na cadeia de aprovação e não poderá mais ser editada até o aprovador decidir."
        confirmLabel="Submeter"
        onConfirm={doSubmit}
      />

      <ConfirmDialog
        open={confirmResubmit}
        onOpenChange={setConfirmResubmit}
        title="Re-submeter para aprovação?"
        description="A cadeia de aprovação será reiniciada do nível 1 — aprovadores já consultados precisarão decidir de novo."
        confirmLabel="Re-submeter"
        onConfirm={doResubmit}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir esta requisição em rascunho?"
        description="A requisição será descartada permanentemente. Anexos enviados também serão removidos."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={doDelete}
      />
    </div>
  );
}
