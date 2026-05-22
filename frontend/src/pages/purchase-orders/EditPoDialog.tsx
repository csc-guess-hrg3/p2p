import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  useEditPurchaseOrder,
  type PurchaseOrder,
} from '@/lib/purchase-orders';
import { useCompany } from '@/lib/company';
import { usePaymentConditions, useTransportadoras } from '@/lib/integration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/format';

interface Props {
  po: PurchaseOrder;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Edição do PC já criado. Volta o pedido pra fluxo de aprovação no P2P
 * e marca STATUS_COMPRA='E' no Linx. Exige motivo (>=5 chars).
 *
 * Mexe em: condição de pagamento, transportadora, endereço, entrega
 * prevista, quantidade e preço unitário dos itens.
 */
export function EditPoDialog({ po, open, onOpenChange }: Props) {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const mut = useEditPurchaseOrder();

  const { data: conditions = [] } = usePaymentConditions(
    activeCompany?.code,
  );
  const { data: transportadoras = [] } = useTransportadoras(
    activeCompany?.code,
  );

  const [reason, setReason] = useState('');
  // Estado inicial: o que o pedido já tem.
  const [paymentCondition, setPaymentCondition] = useState(
    po.paymentCondition?.split(' — ')[0] ?? '',
  );
  const [transportadora, setTransportadora] = useState(
    po.transportadora ?? '',
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    po.deliveryAddress ?? '',
  );
  const [expectedDelivery, setExpectedDelivery] = useState(
    po.expectedDelivery
      ? new Date(po.expectedDelivery).toISOString().slice(0, 10)
      : '',
  );
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (po.items ?? []).map((it) => [it.id, Number(it.unitPrice)]),
    ),
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (po.items ?? []).map((it) => [it.id, Number(it.quantity)]),
    ),
  );

  const total = useMemo(
    () =>
      (po.items ?? []).reduce(
        (s, it) =>
          s + (quantities[it.id] ?? 0) * (prices[it.id] ?? 0),
        0,
      ),
    [po.items, prices, quantities],
  );

  async function handleSubmit() {
    if (reason.trim().length < 5) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Mínimo 5 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    // Só envia campos que foram alterados (evita poluir audit).
    const cond = conditions.find((c) => c.codigo === paymentCondition);
    const paymentValue = cond
      ? `${cond.codigo} — ${cond.descricao}`
      : paymentCondition;
    try {
      await mut.mutateAsync({
        id: po.id,
        reason: reason.trim(),
        paymentCondition: paymentValue || undefined,
        transportadora: transportadora || undefined,
        deliveryAddress: deliveryAddress || undefined,
        expectedDelivery: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : undefined,
        items: (po.items ?? [])
          .map((it) => {
            const q = quantities[it.id];
            const u = prices[it.id];
            const changed =
              q !== Number(it.quantity) || u !== Number(it.unitPrice);
            return changed
              ? { id: it.id, quantity: q, unitPrice: u }
              : null;
          })
          .filter((x): x is { id: string; quantity: number; unitPrice: number } =>
            x !== null,
          ),
      });
      toast({
        title: 'Pedido enviado para nova aprovação',
        description: `${po.number} voltou para "em estudo" no ERP até ser reaprovado.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao editar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar pedido — {po.number}</DialogTitle>
          <DialogDescription>
            O pedido volta para o fluxo de aprovação e fica em &quot;em estudo&quot;
            no ERP até ser reaprovado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Condição de pagamento</Label>
              <Select
                value={paymentCondition}
                onValueChange={setPaymentCondition}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      {c.codigo} — {c.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entrega prevista</Label>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Endereço de entrega</Label>
              <Input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Transportadora</Label>
              <Select
                value={transportadora}
                onValueChange={setTransportadora}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {transportadoras.map((t) => (
                    <SelectItem key={t.nome} value={t.nome}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Preço unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(po.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.itemDescription}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-20 text-right"
                        min={0}
                        step="0.01"
                        value={quantities[it.id] ?? 0}
                        onChange={(e) =>
                          setQuantities((p) => ({
                            ...p,
                            [it.id]: Number(e.target.value),
                          }))
                        }
                      />
                      <span className="ml-1 text-xs text-muted-foreground">
                        {it.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyInput
                        className="w-32 text-right"
                        value={prices[it.id] ?? 0}
                        onChange={(v) =>
                          setPrices((p) => ({ ...p, [it.id]: v }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(
                        (quantities[it.id] ?? 0) * (prices[it.id] ?? 0),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end text-sm">
            <span className="text-muted-foreground">Total:&nbsp;</span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo da edição</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: ajuste no preço negociado com o fornecedor"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mut.isPending || reason.trim().length < 5}
          >
            {mut.isPending ? 'Salvando…' : 'Salvar e reenviar p/ aprovação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// formatNumber é importado para manter consistência com outras telas;
// não usado diretamente aqui.
void formatNumber;
