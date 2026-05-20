import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  FileText,
  PackageCheck,
  RotateCw,
  Send,
  XCircle,
} from 'lucide-react';
import {
  useCancelPurchaseOrder,
  usePurchaseOrder,
  useSendToSupplier,
} from '@/lib/purchase-orders';
import { useCompany } from '@/lib/company';
import {
  SendToSupplierDialog,
  shouldSkipSendPreview,
} from './SendToSupplierDialog';
import { ReceiveDialog } from '@/pages/receiving/ReceiveDialog';
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
  const { activeCompany } = useCompany();
  const sendMut = useSendToSupplier();
  const { toast } = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const cancelMut = useCancelPurchaseOrder();

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

  const canSend = po.status === 'APPROVED';
  const canResend =
    po.status === 'SENT_TO_SUPPLIER' ||
    po.status === 'PARTIALLY_RECEIVED' ||
    po.status === 'FULLY_RECEIVED';
  // Recebimento aceito a partir do envio ao fornecedor, e bloqueado quando
  // o pedido já foi totalmente recebido ou cancelado.
  const canReceive =
    po.status === 'SENT_TO_SUPPLIER' ||
    po.status === 'PARTIALLY_RECEIVED' ||
    po.status === 'APPROVED';
  // Cancelamento permitido em estados não finais. O backend ainda bloqueia
  // se houver item já recebido (RN-OC-03), mas o botão fica visível pra
  // o usuário ver a mensagem clara em vez de "sumir sem explicação".
  const canCancel = !['CANCELLED', 'FULLY_RECEIVED', 'INTEGRATED'].includes(
    po.status,
  );

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

  async function handleSend() {
    if (!po) return;
    // Se o usuário marcou "não exibir de novo", envia direto sem dialog.
    if (shouldSkipSendPreview()) {
      try {
        await sendMut.mutateAsync({ id: po.id });
        toast({
          title: 'Pedido enviado',
          description: `PC ${po.number} enviado ao fornecedor.`,
          variant: 'success',
        });
      } catch (err) {
        const detail =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? 'Não foi possível enviar o pedido ao fornecedor.';
        toast({
          title: 'Falha no envio',
          description: detail,
          variant: 'destructive',
        });
      }
    } else {
      setSendOpen(true);
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/pedidos">
            <ArrowLeft className="size-4" />
            Pedidos de Compra
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
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
          {canResend && (
            <Button variant="outline" onClick={() => setResendOpen(true)}>
              <RotateCw className="size-4" />
              Reenviar e-mail
            </Button>
          )}
          {canReceive && (
            <Button variant="outline" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="size-4" />
              Registrar recebimento
            </Button>
          )}
          {canSend && (
            <Button onClick={handleSend} disabled={sendMut.isPending}>
              <Send className="size-4" />
              {sendMut.isPending ? 'Enviando…' : 'Enviar ao fornecedor'}
            </Button>
          )}
        </div>
      </div>

      {sendOpen && activeCompany && (
        <SendToSupplierDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          po={po}
          mode="send"
          companyCode={activeCompany.code}
        />
      )}
      {resendOpen && activeCompany && (
        <SendToSupplierDialog
          open={resendOpen}
          onOpenChange={setResendOpen}
          po={po}
          mode="resend"
          companyCode={activeCompany.code}
        />
      )}
      {receiveOpen && (
        <ReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
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
        <CardContent className="grid grid-cols-3 gap-4">
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
            label="Enviado ao fornecedor"
            value={formatDate(po.sentToSupplierAt)}
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
            <Field label="Nº do pedido no financeiro" value={po.erpPedido} />
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
    </div>
  );
}
