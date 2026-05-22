import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  useCancelPurchaseOrderItems,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '@/lib/purchase-orders';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatNumber, formatCurrency } from '@/lib/format';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  po: PurchaseOrder;
}

/**
 * RN-OC-03: cancela só o saldo dos itens selecionados. Lista apenas
 * itens que têm saldo em aberto (`quantity - receivedQty > 0`) e que
 * ainda não foram cancelados. Se todos forem marcados e nada sobrar
 * aberto, o pedido inteiro vira CANCELLED automaticamente.
 */
export function CancelItemsDialog({ open, onOpenChange, po }: Props) {
  const { toast } = useToast();
  const mut = useCancelPurchaseOrderItems();

  const cancelable = useMemo(
    () =>
      (po.items ?? []).filter((it) => {
        const saldo = Number(it.quantity) - Number(it.receivedQty);
        return saldo > 0 && !it.cancelledAt;
      }),
    [po.items],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      toast({
        title: 'Selecione ao menos um item',
        variant: 'destructive',
      });
      return;
    }
    if (reason.trim().length < 5) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Mínimo 5 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await mut.mutateAsync({
        id: po.id,
        itemIds: [...selected],
        reason: reason.trim(),
      });
      toast({
        title: 'Itens cancelados',
        description: `${selected.size} item(ns) do pedido ${po.number}.`,
        variant: 'success',
      });
      setSelected(new Set());
      setReason('');
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao cancelar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  function saldoOf(it: PurchaseOrderItem) {
    return Number(it.quantity) - Number(it.receivedQty);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cancelar itens em aberto — {po.number}</DialogTitle>
          <DialogDescription>
            Selecione os itens cujo saldo deve ser cancelado. Itens já
            recebidos integralmente não aparecem aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded-md border">
          {cancelable.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Não há itens com saldo em aberto.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === cancelable.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected(new Set(cancelable.map((i) => i.id)));
                        } else {
                          setSelected(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qtde</th>
                  <th className="px-3 py-2 text-right">Recebido</th>
                  <th className="px-3 py-2 text-right">Saldo a cancelar</th>
                  <th className="px-3 py-2 text-right">Valor saldo</th>
                </tr>
              </thead>
              <tbody>
                {cancelable.map((it) => {
                  const saldo = saldoOf(it);
                  const valorSaldo = saldo * Number(it.unitPrice);
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggle(it.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{it.itemDescription}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.itemErpCode ?? '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(it.quantity)} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {formatNumber(it.receivedQty)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-destructive">
                        {formatNumber(saldo)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(valorSaldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Motivo do cancelamento</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: Fornecedor não cumpriu prazo, demanda cancelada…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              mut.isPending || selected.size === 0 || reason.trim().length < 5
            }
          >
            {mut.isPending ? 'Cancelando…' : `Cancelar ${selected.size} item(ns)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
