import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useConvertToPurchaseOrder } from '@/lib/purchase-orders';
import type { Requisition } from '@/lib/requisitions';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: Requisition;
}

/**
 * Conversão de uma requisição aprovada em Pedido de Compra. O comprador
 * confirma os dados do pedido e ajusta os preços negociados (de estimado
 * para final). Requisições NF_FUTURA também geram uma SV de adiantamento,
 * cujo vencimento é informado aqui.
 */
export function ConvertToPoDialog({ open, onOpenChange, requisition }: Props) {
  const navigate = useNavigate();
  const convertMut = useConvertToPurchaseOrder();
  const isAdvance = requisition.tipoNotaFiscal === 'NF_FUTURA';

  const [paymentCondition, setPaymentCondition] = useState(
    requisition.paymentConditionDesc ?? '',
  );
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [fundRequestDueDate, setFundRequestDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Preços negociados por item — inicializados com o estimado.
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (requisition.items ?? []).map((it) => [
        it.id,
        Number(it.estimatedPrice),
      ]),
    ),
  );

  const total = useMemo(
    () =>
      (requisition.items ?? []).reduce(
        (sum, it) => sum + Number(it.quantity) * (prices[it.id] ?? 0),
        0,
      ),
    [requisition.items, prices],
  );

  async function handleConfirm() {
    setError(null);
    try {
      const po = await convertMut.mutateAsync({
        requisitionId: requisition.id,
        paymentCondition: paymentCondition || undefined,
        deliveryAddress: deliveryAddress || undefined,
        expectedDelivery: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : undefined,
        fundRequestDueDate:
          isAdvance && fundRequestDueDate
            ? new Date(fundRequestDueDate).toISOString()
            : undefined,
        items: (requisition.items ?? []).map((it) => ({
          requisitionItemId: it.id,
          unitPrice: prices[it.id] ?? 0,
        })),
      });
      onOpenChange(false);
      navigate(`/pedidos/${po.id}`);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.message) {
        const msg = err.response.data.message;
        setError(Array.isArray(msg) ? msg.join(' ') : String(msg));
      } else {
        setError('Não foi possível converter a requisição.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Converter em Pedido de Compra</DialogTitle>
          <DialogDescription>
            Confirme os dados do pedido e ajuste os preços negociados.
            {isAdvance &&
              ' Esta requisição é de adiantamento — será gerada também uma Solicitação de Verba.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="paymentCondition">Condição de pagamento</Label>
              <Input
                id="paymentCondition"
                value={paymentCondition}
                onChange={(e) => setPaymentCondition(e.target.value)}
                placeholder="Ex.: 30 dias"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedDelivery">Entrega prevista</Label>
              <Input
                id="expectedDelivery"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="deliveryAddress">Endereço de entrega</Label>
              <Input
                id="deliveryAddress"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            {isAdvance && (
              <div className="space-y-1.5">
                <Label htmlFor="fundRequestDueDate">
                  Vencimento do adiantamento
                </Label>
                <Input
                  id="fundRequestDueDate"
                  type="date"
                  value={fundRequestDueDate}
                  onChange={(e) => setFundRequestDueDate(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Preço negociado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(requisition.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.itemDescription}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(it.quantity)} {it.unit}
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
                        Number(it.quantity) * (prices[it.id] ?? 0),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end text-sm">
            <span className="text-muted-foreground">Total do pedido:&nbsp;</span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={convertMut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={convertMut.isPending}>
            {convertMut.isPending ? 'Convertendo…' : 'Converter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
