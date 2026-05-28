import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, ShoppingCart } from 'lucide-react';
import { useReceiving, useConfirmReceiving } from '@/lib/receiving';
import { usePurchaseOrder, usePurchaseOrderErpStatus } from '@/lib/purchase-orders';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { useAuth } from '@/lib/auth';
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
  const { user } = useAuth();
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

      {/*
        Estado no Linx + comparativo com o que o P2P registrou.
        Operador usa pra responder: "o que o ERP está vendo? bate com o
        que eu recebi?". Divergência aparece com badge amarelo.
        Card MOVIDO do PC detail — faz mais sentido aqui (ato físico).
      */}
      {po?.erpPedido && (
        <ErpStatusCard
          pcId={receiving.purchaseOrderId}
          erpPedido={po.erpPedido}
          poItemById={poItemById}
        />
      )}

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="receiving"
            parentId={receiving.id}
            // Foto/canhoto só pelo operador que recebeu; demais visualizam.
            readOnly={
              receiving.status !== 'DRAFT' ||
              user?.id !== receiving.receivedBy?.id
            }
            hint="Canhoto, foto da entrega, ata de medição ou checklist (PDF, DOCX, XLSX, JPG, PNG — até 10 MB cada, máx. 10 arquivos)."
            allowedDocKinds={['RECEIPT_PHOTO', 'CHECKLIST', 'OTHER']}
            defaultDocKind="RECEIPT_PHOTO"
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Card "Estado no Linx + comparativo P2P" — consulta read-through.
 *
 * Operador usa pra responder: "o que o ERP está vendo? bate com o que
 * já registramos no P2P?". Mostra cada item com 2 colunas:
 *   - Recebido no P2P (somatório dos receivings confirmados)
 *   - Entregue no Linx (QTDE_ENTREGUE da view COMPRAS_CONSUMIVEL)
 * Se houver diferença → badge amarelo "Divergente".
 *
 * Cron BACK_SYNC mantém P2P.receivedQty sincronizado, mas o operador
 * pode forçar uma releitura clicando em "Atualizar".
 */
function ErpStatusCard({
  pcId,
  erpPedido,
  poItemById,
}: {
  pcId: string;
  erpPedido: string;
  poItemById: Map<
    string,
    {
      id: string;
      itemErpCode: string | null;
      itemDescription: string;
      quantity: string;
      receivedQty: string;
      cancelledQty: string;
    }
  >;
}) {
  const erpStatus = usePurchaseOrderErpStatus(pcId, false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">
            Estado no Linx · Pedido {erpPedido}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Consulta direta do ERP. Compare com o que você já registrou
            no P2P. O cron sincroniza a cada 30 min — clique em
            "Atualizar" pra ver o estado agora.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => erpStatus.refetch()}
          disabled={erpStatus.isFetching}
        >
          {erpStatus.isFetching ? 'Consultando…' : 'Atualizar'}
        </Button>
      </CardHeader>
      {erpStatus.data && (
        <CardContent>
          {erpStatus.data.cabecalho && (
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-2 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Status compra</p>
                <p className="font-medium">
                  {erpStatus.data.cabecalho.status_compra ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Status aprovação</p>
                <p className="font-medium">
                  {erpStatus.data.cabecalho.status_aprovacao ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Aprovado por</p>
                <p className="font-medium">
                  {erpStatus.data.cabecalho.aprovado_por || '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Data aprovação</p>
                <p className="font-medium">
                  {erpStatus.data.cabecalho.data_aprovacao
                    ? new Date(
                        erpStatus.data.cabecalho.data_aprovacao,
                      ).toLocaleDateString('pt-BR')
                    : '—'}
                </p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtde pedido</TableHead>
                  <TableHead className="text-right">Recebido P2P</TableHead>
                  <TableHead className="text-right">Entregue Linx</TableHead>
                  <TableHead className="text-right">A entregar (Linx)</TableHead>
                  <TableHead className="text-center">Conciliação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {erpStatus.data.items.map((it, i) => {
                  const code = it.codigo ?? it.consumivel ?? null;
                  const poItem = [...poItemById.values()].find(
                    (p) => p.itemErpCode === code,
                  );
                  const recebidoP2P = poItem ? Number(poItem.receivedQty) : 0;
                  const entregueLinx = Number(it.qtde_entregue ?? 0);
                  const diff = Math.abs(recebidoP2P - entregueLinx);
                  const divergente = diff > 0.0001;
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-mono text-xs">{code ?? '—'}</div>
                        {poItem && (
                          <div className="text-[11px] text-muted-foreground">
                            {poItem.itemDescription}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(it.qtde_original)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(recebidoP2P)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entregueLinx)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatNumber(it.qtde_entregar)}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({formatCurrency(it.valor_entregar)})
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {divergente ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                            <AlertTriangle className="size-3" />
                            Divergente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                            <CheckCircle2 className="size-3" />
                            OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            <strong>Divergente</strong> não é necessariamente erro: o
            fiscal pode não ter lançado a NF ainda (Linx fica atrás), ou
            o recebimento físico foi maior que o registrado no Linx
            (ajuste por NF complementar). Use isto como input pra
            conferência manual.
          </p>
        </CardContent>
      )}
      {!erpStatus.data && !erpStatus.isFetching && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Clique em "Atualizar" pra consultar o Linx agora.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
