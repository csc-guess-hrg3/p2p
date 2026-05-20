import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useCreateReceiving } from '@/lib/receiving';
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/purchase-orders';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  po: PurchaseOrder;
}

interface LineState {
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason: string;
}

/**
 * Diálogo para registrar um recebimento contra um Pedido de Compra.
 * Pré-preenche o "Aceito" com o saldo aberto do item (qtd - recebido).
 * Validação ao salvar: aceito + rejeitado == recebido (regra do backend).
 */
export function ReceiveDialog({ open, onOpenChange, po }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMut = useCreateReceiving();

  const openItems = useMemo(() => {
    return (po.items ?? []).map((it) => {
      const ordered = Number(it.quantity);
      const received = Number(it.receivedQty);
      const remaining = Math.max(0, ordered - received);
      return { item: it as PurchaseOrderItem, remaining };
    });
  }, [po.items]);

  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      openItems.map(({ item, remaining }) => [
        item.id,
        { acceptedQty: remaining, rejectedQty: 0, rejectionReason: '' },
      ]),
    ),
  );
  const [notes, setNotes] = useState('');
  // Campos de medição (PRD § 9.2 RN-REC-02): obrigatórios quando se trata
  // de serviço — exibidos sempre, mas só validados quando o operador marcar.
  const [isService, setIsService] = useState(false);
  const [measurementStart, setMeasurementStart] = useState('');
  const [measurementEnd, setMeasurementEnd] = useState('');
  const [completionPct, setCompletionPct] = useState('');
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<LineState>) {
    setLines((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }

  async function handleSave() {
    setError(null);
    // Só envia linhas com quantidade > 0 — recebimento parcial é normal.
    const items = openItems
      .map(({ item }) => {
        const l = lines[item.id];
        const accepted = Number(l?.acceptedQty || 0);
        const rejected = Number(l?.rejectedQty || 0);
        if (accepted + rejected <= 0) return null;
        return {
          purchaseOrderItemId: item.id,
          receivedQty: accepted + rejected,
          acceptedQty: accepted,
          rejectedQty: rejected,
          rejectionReason: l?.rejectionReason?.trim() || undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (items.length === 0) {
      setError('Informe pelo menos um item recebido.');
      return;
    }
    // Se rejeitou, o motivo é obrigatório (boa prática operacional).
    for (const it of items) {
      if (it.rejectedQty > 0 && !it.rejectionReason) {
        const desc = po.items?.find((i) => i.id === it.purchaseOrderItemId)
          ?.itemDescription;
        setError(`Informe o motivo da rejeição do item: ${desc}`);
        return;
      }
    }
    // RN-REC-02: para serviços, período medido + % conclusão obrigatórios.
    if (isService) {
      if (!measurementStart || !measurementEnd) {
        setError('Informe a data de início e a data de fim da medição.');
        return;
      }
      if (new Date(measurementEnd) < new Date(measurementStart)) {
        setError('Data de fim não pode ser anterior à de início.');
        return;
      }
      const pct = Number(completionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setError('Informe o % de conclusão entre 0 e 100.');
        return;
      }
    }

    try {
      const created = await createMut.mutateAsync({
        purchaseOrderId: po.id,
        notes: notes.trim() || undefined,
        items,
        measurementStart: isService
          ? new Date(measurementStart).toISOString()
          : undefined,
        measurementEnd: isService
          ? new Date(measurementEnd).toISOString()
          : undefined,
        completionPct:
          isService && completionPct ? Number(completionPct) : undefined,
      });
      toast({
        title: 'Recebimento registrado',
        description: `${created.number} criado em rascunho. Confirme para atualizar o saldo do pedido.`,
        variant: 'success',
      });
      onOpenChange(false);
      navigate(`/recebimentos/${created.id}`);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.message) {
        const m = err.response.data.message;
        setError(Array.isArray(m) ? m.join(' ') : String(m));
      } else {
        setError('Não foi possível registrar o recebimento.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>
            Pedido {po.number} — {po.supplierName}. Informe as quantidades
            recebidas; o aceito vai para o saldo do pedido na confirmação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Pedido</TableHead>
                  <TableHead className="text-right">Já recebido</TableHead>
                  <TableHead className="text-right">Aceito</TableHead>
                  <TableHead className="text-right">Rejeitado</TableHead>
                  <TableHead>Motivo da rejeição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openItems.map(({ item, remaining }) => {
                  const line = lines[item.id];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="align-top">
                        <p>{item.itemDescription}</p>
                        <p className="text-xs text-muted-foreground">
                          un. {item.unit}
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-right text-muted-foreground">
                        {formatNumber(item.quantity)}
                      </TableCell>
                      <TableCell className="align-top text-right text-muted-foreground">
                        {formatNumber(item.receivedQty)}
                        <p className="text-xs text-muted-foreground">
                          saldo {formatNumber(remaining)}
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.0001"
                          className="w-24 text-right"
                          value={line?.acceptedQty ?? 0}
                          onChange={(e) =>
                            update(item.id, {
                              acceptedQty: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.0001"
                          className="w-24 text-right"
                          value={line?.rejectedQty ?? 0}
                          onChange={(e) =>
                            update(item.id, {
                              rejectedQty: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          className="w-full"
                          placeholder={
                            (line?.rejectedQty ?? 0) > 0
                              ? 'Obrigatório'
                              : 'Opcional'
                          }
                          value={line?.rejectionReason ?? ''}
                          onChange={(e) =>
                            update(item.id, {
                              rejectionReason: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">Este recebimento é uma medição de serviço</p>
                <p className="text-xs text-muted-foreground">
                  Marque quando estiver registrando a execução de um serviço
                  com período e % concluído (em vez de entrega física).
                </p>
              </div>
              <input
                type="checkbox"
                checked={isService}
                onChange={(e) => setIsService(e.target.checked)}
              />
            </label>
            {isService && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meas-start">Início do período</Label>
                  <Input
                    id="meas-start"
                    type="date"
                    value={measurementStart}
                    onChange={(e) => setMeasurementStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meas-end">Fim do período</Label>
                  <Input
                    id="meas-end"
                    type="date"
                    value={measurementEnd}
                    onChange={(e) => setMeasurementEnd(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meas-pct">% concluído</Label>
                  <Input
                    id="meas-pct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={completionPct}
                    onChange={(e) => setCompletionPct(e.target.value)}
                    placeholder="0–100"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-notes">Observações (opcional)</Label>
            <Textarea
              id="rec-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={createMut.isPending}>
            {createMut.isPending ? 'Salvando…' : 'Salvar rascunho'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
