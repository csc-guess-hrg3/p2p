import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Grid3x3 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  usePaOrder,
  usePaItemGrade,
  type PaItem,
} from '@/lib/product-orders-pa';
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
  E: { label: 'Em estudo', variant: 'neutral' },
  A: { label: 'Aprovado', variant: 'success' },
  R: { label: 'Reprovado', variant: 'destructive' },
  C: { label: 'Cancelado', variant: 'neutral' },
  M: { label: 'Microvix', variant: 'default' },
};

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

export function PaOrderDetailPage() {
  const { pedido } = useParams();
  const { activeCompany } = useCompany();
  const [gradeFor, setGradeFor] = useState<PaItem | null>(null);
  const { data, isLoading } = usePaOrder(activeCompany?.code, pedido);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Pedido não encontrado.</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/pedidos-pa">
          <ArrowLeft className="size-4" />
          Pedidos PA
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">Pedido {data.pedido}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{data.fornecedor}</p>
          </div>
          <PaStatusBadge status={data.status_compra} />
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
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
                <TableHead className="text-right">Entregue</TableHead>
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
                    {formatDate(it.entrega)}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.qtde_original ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {it.qtde_entregue ?? 0}
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

      {gradeFor && activeCompany && (
        <ItemGradeDialog
          open={!!gradeFor}
          onOpenChange={(v) => !v && setGradeFor(null)}
          company={activeCompany.code}
          pedido={data.pedido}
          item={gradeFor}
        />
      )}
    </div>
  );
}
