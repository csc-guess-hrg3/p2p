import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Check, AlertTriangle, FileText } from 'lucide-react';
import {
  useCreateReceiving,
  useReceivingCandidateNotes,
} from '@/lib/receiving';
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/purchase-orders';
import { formatNumber, formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const NO_NOTE = '__none__';

/**
 * Diálogo para registrar um recebimento contra um Pedido de Compra.
 *
 * Camada 1 (clareza): mostra o contexto do pedido (fornecedor/total) e separa
 * visualmente "nota fiscal", "itens recebidos" e "medição de serviço".
 * Camada 2 (nota): anexa a nota fiscal que justifica o recebimento e confere
 * fornecedor/valor contra o pedido (alerta, não bloqueio). O abatimento por
 * ITEM a partir da nota (pré-preencher quantidades) é etapa seguinte.
 */
export function ReceiveDialog({ open, onOpenChange, po }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMut = useCreateReceiving();
  const { data: candidateNotes } = useReceivingCandidateNotes(
    open ? po.id : undefined,
  );

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
  const [noteId, setNoteId] = useState<string>(NO_NOTE);
  // Campos de medição (PRD § 9.2 RN-REC-02): obrigatórios quando se trata
  // de serviço — exibidos sempre, mas só validados quando o operador marcar.
  const [isService, setIsService] = useState(false);
  const [measurementStart, setMeasurementStart] = useState('');
  const [measurementEnd, setMeasurementEnd] = useState('');
  const [completionPct, setCompletionPct] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedNote =
    candidateNotes?.find((n) => n.id === noteId) ?? null;

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
        fiscalDocumentId: noteId !== NO_NOTE ? noteId : undefined,
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
            Pedido {po.number} · {po.supplierName} · total{' '}
            {formatCurrency(po.totalAmount)}. Confira a nota, informe o que
            chegou e confirme para abater o saldo do pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Nota fiscal (camada 2) ── */}
          <section className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Nota fiscal</p>
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </div>
            <Select value={noteId} onValueChange={setNoteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a nota que veio com a entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_NOTE}>
                  Sem nota / ainda não recebi a nota
                </SelectItem>
                {(candidateNotes ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.type === 'NFSe' ? 'NFS-e' : 'NF-e'} {n.numero}
                    {n.serie ? `/${n.serie}` : ''} · {n.supplierName} ·{' '}
                    {formatCurrency(n.valorTotal)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {candidateNotes && candidateNotes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma nota encontrada para este fornecedor ainda. Você pode
                registrar o recebimento sem nota e vinculá-la depois.
              </p>
            )}

            {selectedNote && (
              <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
                <ConfEntry
                  ok={selectedNote.supplierMatch}
                  label="Fornecedor"
                  okText={`Confere: ${selectedNote.supplierName}`}
                  warnText={`Verificar: nota é de "${selectedNote.supplierName}", pedido é de "${po.supplierName}"`}
                />
                <ConfEntry
                  ok={!selectedNote.excedePedido}
                  label="Valor"
                  okText={`${formatCurrency(selectedNote.valorNota)} (pedido ${formatCurrency(selectedNote.totalPedido)})`}
                  warnText={`Nota ${formatCurrency(selectedNote.valorNota)} acima do pedido ${formatCurrency(selectedNote.totalPedido)}`}
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Emissão {formatDate(selectedNote.emissao)}
                  {selectedNote.type === 'NFSe' &&
                    ' · nota de serviço (sem itens padronizados — confira as quantidades manualmente)'}
                  . Ao confirmar o recebimento, a nota fica vinculada a este
                  pedido.
                </p>
              </div>
            )}
          </section>

          {/* ── Itens recebidos (camada 1) ── */}
          <section className="space-y-1">
            <p className="text-sm font-medium">Itens recebidos</p>
            <p className="text-xs text-muted-foreground">
              O campo "Aceito" já vem com o saldo em aberto — ajuste conforme o
              que realmente chegou. O aceito entra no saldo do pedido quando
              você confirmar.
            </p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Saldo em aberto</TableHead>
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
                        <TableCell className="align-top text-right">
                          <span className="font-medium">
                            {formatNumber(remaining)}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            já recebido {formatNumber(item.receivedQty)}
                          </p>
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Input
                            type="number"
                            inputMode="decimal"
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
                            inputMode="decimal"
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
          </section>

          {/* ── Medição de serviço (camada 1: framing claro) ── */}
          <section className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">Isto é uma medição de serviço</p>
                <p className="text-xs text-muted-foreground">
                  Marque para registrar execução de serviço (período + %
                  concluído) em vez de entrega física de itens.
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
                    inputMode="decimal"
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
          </section>

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

/** Uma linha da conferência de cabeçalho (fornecedor/valor) da nota. */
function ConfEntry({
  ok,
  label,
  okText,
  warnText,
}: {
  ok: boolean;
  label: string;
  okText: string;
  warnText: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </p>
        <p className={ok ? '' : 'text-warning'}>{ok ? okText : warnText}</p>
      </div>
    </div>
  );
}
