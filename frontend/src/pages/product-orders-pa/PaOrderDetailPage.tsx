import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleCheck,
  CircleSlash,
  CircleX,
  FileText,
  Grid3x3,
  PackageCheck,
  X,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useApprovePaOrder,
  usePaOrder,
  usePaItemGrade,
  useRejectPaOrder,
  type PaItem,
  type PaTimelineEvent,
} from '@/lib/product-orders-pa';
import { RescheduleDialog } from './RescheduleDialog';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'destructive' | 'warning' | 'neutral' }
> = {
  P: { label: 'Pendente aprovação', variant: 'warning' },
  E: { label: 'Aguardando aprovação', variant: 'warning' },
  A: { label: 'Aprovado', variant: 'success' },
  R: { label: 'Reprovado', variant: 'destructive' },
  C: { label: 'Cancelado', variant: 'neutral' },
  CP: { label: 'Cancelado parcial', variant: 'warning' },
  D: { label: 'Entregue', variant: 'success' },
  DP: { label: 'Entregue parcialmente', variant: 'default' },
  M: { label: 'Microvix', variant: 'default' },
};

/**
 * Item da timeline — ícone + label, com data relativa à esquerda.
 * Cores acompanham a natureza do evento (criação azul, aprovação verde,
 * reprovação vermelha, NF cinza).
 */
function TimelineRow({ ev }: { ev: PaTimelineEvent }) {
  const { Icon, color } = (() => {
    switch (ev.kind) {
      case 'created':
        return { Icon: FileText, color: 'text-primary' };
      case 'approved':
        return { Icon: CircleCheck, color: 'text-emerald-600' };
      case 'rejected':
        return { Icon: CircleX, color: 'text-destructive' };
      case 'nf':
        return { Icon: PackageCheck, color: 'text-foreground' };
      case 'reschedule':
        return { Icon: CalendarClock, color: 'text-warning' };
      default:
        return { Icon: CircleSlash, color: 'text-muted-foreground' };
    }
  })();
  return (
    <li className="flex gap-3">
      <div className={`mt-0.5 ${color}`}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{ev.label}</span>
          <span className="text-xs text-muted-foreground">{formatDate(ev.at)}</span>
        </div>
        {(ev.who || ev.detail) && (
          <p className="text-xs text-muted-foreground">
            {[ev.who, ev.detail].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </li>
  );
}

function PaStatusBadge({ status }: { status: string }) {
  const key = (status ?? '').trim().toUpperCase();
  const meta = STATUS_MAP[key] ?? { label: key, variant: 'neutral' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

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

/** Modal com a grade vertical de um item. */
function ItemGradeDialog({
  open,
  onOpenChange,
  company,
  pedido,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: string;
  pedido: string;
  item: PaItem;
}) {
  const { data, isLoading } = usePaItemGrade(
    company,
    pedido,
    item.produto,
    item.cor,
    item.entrega,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Grade — {item.produto} / cor {item.cor}
          </DialogTitle>
          <DialogDescription>
            Quantidades por tamanho. Entrega: {formatDate(item.entrega)}
            {data?.grade ? ` · grade ${data.grade}` : ''}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !data?.rows?.length ? (
          <p className="text-sm text-muted-foreground">
            Sem distribuição por tamanho neste item.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posição</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">Entregue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.posicao}>
                  <TableCell className="text-muted-foreground">
                    {r.posicao}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.tamanho ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.qtdeOriginal}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.qtdeEntregue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  company,
  pedido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: string;
  pedido: string;
}) {
  const { toast } = useToast();
  const rejectMut = useRejectPaOrder();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (reason.trim().length < 10) {
      setError('O motivo precisa ter no mínimo 10 caracteres.');
      return;
    }
    setError(null);
    try {
      await rejectMut.mutateAsync({ company, pedido, reason });
      toast({ title: 'Pedido reprovado', description: pedido, variant: 'default' });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      setError(msg || 'Não foi possível reprovar.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprovar pedido {pedido}</DialogTitle>
          <DialogDescription>
            Informe o motivo. Ele fica gravado no ERP em &quot;Observações&quot;
            para o histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Motivo</Label>
          <Textarea
            id="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={rejectMut.isPending}
          >
            {rejectMut.isPending ? 'Reprovando…' : 'Confirmar reprovação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaOrderDetailPage() {
  const { pedido } = useParams();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [gradeFor, setGradeFor] = useState<PaItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const approveMut = useApprovePaOrder();
  const { data, isLoading } = usePaOrder(activeCompany?.code, pedido);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!data || !activeCompany) {
    return <p className="text-sm text-muted-foreground">Pedido não encontrado.</p>;
  }

  // Aprovar/Reprovar só faz sentido enquanto o pedido está em estudo no
  // ERP. Se foi cancelado (parcial ou totalmente), trava.
  const isPending = (data.status_compra ?? '').trim() === 'E';
  const efetivo = (data.status_efetivo ?? data.status_compra ?? '').trim();
  const isCancelled = efetivo === 'C' || efetivo === 'CP';
  const canDecide = data.canApprovePa && isPending && !isCancelled;

  // Reagendar entrega: backend resolve a permissão olhando o time
  // configurado (paReschedulerTeamId) ou ADMIN. Aqui só travamos quando
  // o pedido já está fechado/cancelado/sem saldo.
  const canReschedule =
    !!data.canReschedule &&
    !!data.proxima_entrega &&
    !['C', 'R', 'D'].includes(efetivo);

  async function handleApprove() {
    if (!data || !activeCompany) return;
    if (!confirm(`Aprovar o pedido ${data.pedido}?`)) return;
    try {
      await approveMut.mutateAsync({
        company: activeCompany.code,
        pedido: data.pedido,
      });
      toast({
        title: 'Pedido aprovado',
        description: data.pedido,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao aprovar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/pedidos-pa">
            <ArrowLeft className="size-4" />
            Pedidos PA
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canReschedule && (
            <Button
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
            >
              <CalendarClock className="size-4" />
              Reagendar entrega
            </Button>
          )}
        {canDecide && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(true)}
            >
              <X className="size-4 text-destructive" />
              Reprovar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMut.isPending}
            >
              <Check className="size-4" />
              {approveMut.isPending ? 'Aprovando…' : 'Aprovar'}
            </Button>
          </div>
        )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">Pedido {data.pedido}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{data.fornecedor}</p>
          </div>
          <PaStatusBadge status={efetivo} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Filial" value={data.filial} />
          <Field label="Tipo de compra" value={data.tipo_compra} />
          <Field label="Condição" value={data.condicao_pgto || '—'} />
          <Field label="Emissão" value={formatDate(data.emissao)} />
          <Field label="Cadastramento" value={formatDate(data.cadastramento)} />
          <Field
            label="Aprovação"
            value={
              data.data_aprovacao
                ? `${formatDate(data.data_aprovacao)} · ${data.aprovado_por ?? '—'}`
                : '—'
            }
          />
          <Field
            label="Qtde original"
            value={String(data.tot_qtde_original ?? '—')}
          />
          <Field
            label="Qtde cancelada"
            value={
              data.tot_qtde_cancelada && data.tot_qtde_cancelada > 0 ? (
                <span className="font-medium text-warning">
                  {data.tot_qtde_cancelada}
                  {data.tot_qtde_original
                    ? ` de ${data.tot_qtde_original}`
                    : ''}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field
            label="Valor total"
            value={
              <span className="font-semibold">
                {formatCurrency(data.tot_valor_original)}
              </span>
            }
          />
          <Field label="Natureza" value={data.natureza_entrada ?? '—'} />
          {data.obs && (
            <div className="col-span-3 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Observações do ERP
              </p>
              {data.obs}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens ({data.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead className="text-right">Cancelada</TableHead>
                <TableHead className="text-right">Entregue</TableHead>
                <TableHead>NF</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((it, i) => (
                <TableRow key={`${it.produto}-${it.cor}-${it.entrega}-${i}`}>
                  <TableCell className="font-medium">{it.produto}</TableCell>
                  <TableCell>{it.cor}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {it.was_rescheduled ? (
                      <span title={`Original: ${formatDate(it.entrega)}`}>
                        <span className="font-medium text-foreground">
                          {formatDate(it.limite_entrega)}
                        </span>
                        <span className="ml-1 text-xs italic text-muted-foreground">
                          (reagendada)
                        </span>
                      </span>
                    ) : (
                      formatDate(it.entrega)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.qtde_original ?? '—'}
                  </TableCell>
                  <TableCell
                    className={
                      it.qtde_cancelada && it.qtde_cancelada > 0
                        ? 'text-right font-medium text-warning'
                        : 'text-right text-muted-foreground'
                    }
                  >
                    {it.qtde_cancelada ?? 0}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {it.qtde_entregue ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {it.nfs && it.nfs.length > 0
                      ? it.nfs.map((n) => n.nf).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(it.custo_unit)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(it.valor_original)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGradeFor(it)}
                    >
                      <Grid3x3 className="size-4" />
                      Grade
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.nfs && data.nfs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notas fiscais recebidas ({data.nfs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Série</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Recebimento</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.nfs.map((nf) => (
                  <TableRow key={`${nf.nf}-${nf.serie ?? ''}`}>
                    <TableCell className="font-medium">{nf.nf}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {nf.serie || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nf.fornecedor}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(nf.emissao)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(nf.recebimento)}
                    </TableCell>
                    <TableCell className="text-right">{nf.qtde_total}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(nf.valor_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.timeline && data.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.timeline.map((ev, i) => (
                <TimelineRow key={`${ev.at}-${ev.kind}-${i}`} ev={ev} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {rescheduleOpen && activeCompany && data && (
        <RescheduleDialog
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          company={activeCompany.code}
          pedido={data.pedido}
          items={data.items}
          proximaEntrega={data.proxima_entrega}
        />
      )}

      {gradeFor && activeCompany && (
        <ItemGradeDialog
          open={!!gradeFor}
          onOpenChange={(v) => !v && setGradeFor(null)}
          company={activeCompany.code}
          pedido={data.pedido}
          item={gradeFor}
        />
      )}
      {rejectOpen && activeCompany && (
        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          company={activeCompany.code}
          pedido={data.pedido}
        />
      )}
    </div>
  );
}
