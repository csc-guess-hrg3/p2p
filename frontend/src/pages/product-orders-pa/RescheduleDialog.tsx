import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  useReschedulePaOrder,
  type PaItem,
  type ReschedulePayload,
} from '@/lib/product-orders-pa';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: string;
  pedido: string;
  items: PaItem[];
  /** Próxima entrega vigente do pedido — sugerida como ponto de partida. */
  proximaEntrega: string | null;
}

/**
 * Diálogo de reagendamento de entrega de pedido PA.
 *
 * Default scope='order' (afeta todos os itens abertos). Se a usuária
 * trocar pra 'item', mostra um Select com os itens AINDA abertos
 * (qtde_entregar > 0). A nova data e o motivo são obrigatórios.
 */
export function RescheduleDialog({
  open,
  onOpenChange,
  company,
  pedido,
  items,
  proximaEntrega,
}: Props) {
  const { toast } = useToast();
  const mut = useReschedulePaOrder();

  // Itens com saldo a entregar — os únicos elegíveis pra reagendamento item-level.
  const openItems = useMemo(
    () => items.filter((i) => (i.qtde_entregar ?? 0) > 0),
    [items],
  );

  const [scope, setScope] = useState<'order' | 'item'>('order');
  const [itemKey, setItemKey] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Resetar form quando o dialog reabre.
  function reset() {
    setScope('order');
    setItemKey('');
    setToDate('');
    setReason('');
  }

  function keyOf(it: PaItem) {
    return `${it.produto}|${it.cor}|${it.entrega}`;
  }
  const selectedItem = openItems.find((it) => keyOf(it) === itemKey);

  async function handleSubmit() {
    const payload: ReschedulePayload = {
      scope,
      toDate,
      reason,
    };
    if (scope === 'item') {
      if (!selectedItem) {
        toast({
          title: 'Selecione o item',
          description: 'Escolha qual linha do pedido será reagendada.',
          variant: 'destructive',
        });
        return;
      }
      payload.produto = selectedItem.produto;
      payload.cor = selectedItem.cor;
      payload.entregaOriginal = selectedItem.entrega;
    }
    try {
      await mut.mutateAsync({ company, pedido, payload });
      toast({
        title: 'Entrega reagendada',
        description: `Mudança registrada no histórico do pedido ${pedido}.`,
        variant: 'success',
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao reagendar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reagendar entrega — Pedido {pedido}</DialogTitle>
          <DialogDescription>
            A data original fica preservada — a mudança aparece no histórico
            como DE/PARA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Escopo</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'order' | 'item')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Pedido inteiro</SelectItem>
                <SelectItem value="item" disabled={openItems.length === 0}>
                  Apenas um item específico
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'item' && (
            <div className="space-y-1.5">
              <Label>Item a reagendar</Label>
              <Select value={itemKey} onValueChange={setItemKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {openItems.map((it) => (
                    <SelectItem key={keyOf(it)} value={keyOf(it)}>
                      {it.produto} · {it.cor} ·{' '}
                      {formatDate(it.limite_entrega ?? it.entrega)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nova data de entrega</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Vigente atual:{' '}
              {scope === 'item' && selectedItem
                ? formatDate(selectedItem.limite_entrega ?? selectedItem.entrega)
                : formatDate(proximaEntrega)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: Fornecedor pediu prazo extra, atraso na produção…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || !toDate || reason.trim().length < 5}
          >
            {mut.isPending ? 'Salvando…' : 'Reagendar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
