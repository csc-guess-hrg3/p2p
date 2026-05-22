import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, ShoppingCart } from 'lucide-react';
import { useReceiving, useConfirmReceiving } from '@/lib/receiving';
import { usePurchaseOrder } from '@/lib/purchase-orders';
import { formatDate, formatNumber } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { AttachmentsSection } from '@/components/AttachmentsSection';
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
import { isAxiosError } from 'axios';

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

export function ReceivingDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const { data: receiving, isLoading } = useReceiving(id);
  // Carrega o PC pra exibir a descrição dos itens (o backend devolve só ID
  // do PO item no recebimento; cruzamos pelo lado).
  const { data: po } = usePurchaseOrder(receiving?.purchaseOrderId);
  const confirmMut = useConfirmReceiving();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!receiving) {
    return (
      <p className="text-sm text-muted-foreground">
        Recebimento não encontrado.
      </p>
    );
  }

  const canConfirm = receiving.status === 'DRAFT';
  const poItemById = new Map(
    (po?.items ?? []).map((it) => [it.id, it] as const),
  );

  async function handleConfirm() {
    if (!receiving) return;
    try {
      await confirmMut.mutateAsync(receiving.id);
      toast({
        title: 'Recebimento confirmado',
        description: `Saldo do pedido ${receiving.purchaseOrder?.number ?? ''} atualizado.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao confirmar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/recebimentos">
            <ArrowLeft className="size-4" />
            Recebimentos
          </Link>
        </Button>
        {canConfirm && (
          <Button onClick={handleConfirm} disabled={confirmMut.isPending}>
            <Check className="size-4" />
            {confirmMut.isPending ? 'Confirmando…' : 'Confirmar recebimento'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{receiving.number}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedido {receiving.purchaseOrder?.number ?? '—'}
            </p>
          </div>
          <StatusBadge status={receiving.status} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Recebido por" value={receiving.receivedBy?.name ?? '—'} />
          <Field label="Recebido em" value={formatDate(receiving.receivedAt)} />
          <Field label="Confirmado em" value={formatDate(receiving.confirmedAt)} />
          {receiving.measurementStart && (
            <Field
              label="Medição (início)"
              value={formatDate(receiving.measurementStart)}
            />
          )}
          {receiving.measurementEnd && (
            <Field
              label="Medição (fim)"
              value={formatDate(receiving.measurementEnd)}
            />
          )}
          {receiving.completionPct != null && (
            <Field
              label="% concluído"
              value={`${Number(receiving.completionPct).toFixed(2)}%`}
            />
          )}
          {receiving.notes && (
            <div className="col-span-3">
              <Field label="Observações" value={receiving.notes} />
            </div>
          )}
          {receiving.divergenceNotes && (
            <div className="col-span-3 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs uppercase tracking-wide text-warning">
                Divergência
              </p>
              <p className="mt-0.5 text-sm">{receiving.divergenceNotes}</p>
            </div>
          )}
          <div className="col-span-3">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/pedidos/${receiving.purchaseOrderId}`}>
                <ShoppingCart className="size-4" />
                Ver pedido de compra
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens recebidos</CardTitle>
        </CardHeader>
        <CardContent>
         <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Aceito</TableHead>
                <TableHead className="text-right">Rejeitado</TableHead>
                <TableHead>Motivo da rejeição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(receiving.items ?? []).map((it) => {
                const poItem = poItemById.get(it.purchaseOrderItemId);
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      {poItem?.itemDescription ?? it.purchaseOrderItemId}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(it.receivedQty)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(it.acceptedQty)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(it.rejectedQty)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {it.rejectionReason || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
         </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="receiving"
            parentId={receiving.id}
            readOnly={receiving.status !== 'DRAFT'}
            hint="Canhoto, foto da entrega, ata de medição ou checklist (PDF, DOCX, XLSX, JPG, PNG — até 10 MB cada, máx. 10 arquivos)."
          />
        </CardContent>
      </Card>
    </div>
  );
}
