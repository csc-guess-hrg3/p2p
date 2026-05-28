import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  FileText,
  PackageCheck,
  Pencil,
  Scissors,
  XCircle,
} from 'lucide-react';
import {
  useCancelPurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderHistory,
} from '@/lib/purchase-orders';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { ReceiveDialog } from '@/pages/receiving/ReceiveDialog';
import { CancelItemsDialog } from './CancelItemsDialog';
import { EditPoDialog } from './EditPoDialog';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
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

export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { user } = useAuth();
  const { toast } = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelItemsOpen, setCancelItemsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const cancelMut = useCancelPurchaseOrder();
  const historyQ = usePurchaseOrderHistory(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!po) {
    return (
      <p className="text-sm text-muted-foreground">
        Pedido de compra não encontrado.
      </p>
    );
  }

  // Recebimento aceito enquanto o pedido está aberto. APPROVED é raro
  // hoje (a gravação no Linx é automática ao converter, status já vira
  // INTEGRATED), mas mantemos compatibilidade. SENT_TO_SUPPLIER foi
  // removido — só existirá no módulo PA futuro, que terá sua própria
  // tela de recebimento.
  const canReceive =
    po.status === 'APPROVED' ||
    po.status === 'INTEGRATED' ||
    po.status === 'PARTIALLY_RECEIVED';
  // Cancelamento permitido em estados não finais. O backend ainda bloqueia
  // se houver item já recebido (RN-OC-03), mas o botão fica visível pra
  // o usuário ver a mensagem clara em vez de "sumir sem explicação".
  const canCancel = !['CANCELLED', 'FULLY_RECEIVED', 'INTEGRATED'].includes(
    po.status,
  );
  // Existe saldo aberto pra cancelar item-a-item?
  const hasOpenBalance = (po.items ?? []).some(
    (it) =>
      !it.cancelledAt && Number(it.quantity) - Number(it.receivedQty) > 0,
  );
  const canCancelItems =
    !['CANCELLED', 'INTEGRATED'].includes(po.status) && hasOpenBalance;
  // Edição: bloqueia se já recebeu ou se está fechado.
  const anyReceived = (po.items ?? []).some(
    (it) => Number(it.receivedQty) > 0,
  );
  const canEdit =
    !['CANCELLED', 'FULLY_RECEIVED'].includes(po.status) && !anyReceived;

  async function handleCancel() {
    if (!po) return;
    const reason = prompt(
      'Motivo do cancelamento (mín. 10 caracteres):',
    )?.trim();
    if (!reason) return;
    if (reason.length < 10) {
      toast({
        title: 'Motivo muito curto',
        description: 'Informe ao menos 10 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await cancelMut.mutateAsync({ id: po.id, cancellationReason: reason });
      toast({
        title: 'Pedido cancelado',
        description: po.number,
        variant: 'success',
      });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Não foi possível cancelar.';
      toast({
        title: 'Falha ao cancelar',
        description: detail,
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/pedidos">
            <ArrowLeft className="size-4" />
            Pedidos de Compra
          </Link>
        </Button>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Editar
            </Button>
          )}
          {canCancelItems && (
            <Button
              variant="outline"
              onClick={() => setCancelItemsOpen(true)}
            >
              <Scissors className="size-4 text-warning" />
              Cancelar itens em aberto
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={cancelMut.isPending}
            >
              <XCircle className="size-4 text-destructive" />
              Cancelar pedido
            </Button>
          )}
          {canReceive && (
            <Button onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="size-4" />
              Registrar recebimento
            </Button>
          )}
        </div>
      </div>

      {receiveOpen && (
        <ReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          po={po}
        />
      )}
      {cancelItemsOpen && (
        <CancelItemsDialog
          open={cancelItemsOpen}
          onOpenChange={setCancelItemsOpen}
          po={po}
        />
      )}
      {editOpen && (
        <EditPoDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          po={po}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{po.number}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {po.supplierName}
            </p>
          </div>
          <StatusBadge status={po.status} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Filial" value={po.branchName} />
          <Field label="Fornecedor" value={po.supplierName} />
          <Field label="Comprador" value={po.buyer?.name ?? '—'} />
          <Field
            label="Condição de pagamento"
            value={po.paymentCondition || '—'}
          />
          <Field
            label="Entrega prevista"
            value={formatDate(po.expectedDelivery)}
          />
          <Field label="Criado em" value={formatDate(po.createdAt)} />
          <Field
            label="Endereço de entrega"
            value={po.deliveryAddress || '—'}
          />
          <Field
            label="Oficializado no ERP"
            value={formatDate(po.integratedAt)}
          />
          <Field
            label="Valor total"
            value={
              <span className="font-semibold">
                {formatCurrency(po.totalAmount)}
              </span>
            }
          />
          <div className="col-span-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/requisicoes/${po.requisitionId}`}>
                <FileText className="size-4" />
                Ver requisição de origem
              </Link>
            </Button>
            {po.fundRequest && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/solicitacoes-verba/${po.fundRequest.id}`}>
                  <Banknote className="size-4" />
                  SV de adiantamento {po.fundRequest.number}
                </Link>
              </Button>
            )}
          </div>
          {po.erpPedido && (
            <Field label="Nº do pedido no Linx" value={po.erpPedido} />
          )}
          {po.status === 'CANCELLED' && po.cancellationReason && (
            <div className="col-span-3">
              <Field
                label="Motivo do cancelamento"
                value={po.cancellationReason}
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
                <TableHead className="text-right">Preço unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Cancelado</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Rateios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(po.items ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.itemDescription}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(it.quantity)}
                  </TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(it.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(it.totalPrice)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatNumber(it.receivedQty)}
                  </TableCell>
                  <TableCell
                    className={
                      Number(it.cancelledQty) > 0
                        ? 'text-right font-medium text-warning'
                        : 'text-right text-muted-foreground'
                    }
                    title={
                      it.cancellationReason
                        ? `Motivo: ${it.cancellationReason}`
                        : undefined
                    }
                  >
                    {Number(it.cancelledQty) > 0
                      ? formatNumber(it.cancelledQty)
                      : '—'}
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
            kind="purchaseOrder"
            parentId={po.id}
            // Só o comprador (quem criou o PC) anexa; demais visualizam.
            readOnly={
              ['CANCELLED'].includes(po.status) ||
              user?.id !== po.buyer?.id
            }
            hint="Cotações, contrato com o fornecedor, anexos da negociação (PDF/DOCX/XLSX/imagens — até 10 MB cada, máx. 10)."
            allowedDocKinds={['QUOTATION', 'CONTRACT', 'INVOICE', 'OTHER']}
            defaultDocKind="CONTRACT"
          />
        </CardContent>
      </Card>

      <HistoryTimeline events={historyQ.data} />
    </div>
  );
}
