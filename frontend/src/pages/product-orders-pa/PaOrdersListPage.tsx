import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { usePaOrders } from '@/lib/product-orders-pa';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

/** Tradução dos códigos do COMPRAS_STATUS para rótulo e cor. */
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

const STATUS_OPTIONS = [
  { value: 'P', label: 'Pendentes aprovação' },
  { value: 'E', label: 'Em estudo' },
  { value: 'A', label: 'Aprovados' },
  { value: 'R', label: 'Reprovados' },
  { value: 'C', label: 'Cancelados' },
  { value: 'ALL', label: 'Todos' },
];

export function PaOrdersListPage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [status, setStatus] = useState('P');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = usePaOrders(activeCompany?.code, {
    status,
    search: search || undefined,
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Pedidos de compra de <strong>produto acabado</strong> — nascem no ERP
          e ficam aqui para aprovação do diretor da marca.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por número ou fornecedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Qtde</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Emissão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum pedido encontrado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.pedido}
                className="cursor-pointer"
                onClick={() => navigate(`/pedidos-pa/${r.pedido}`)}
              >
                <TableCell className="font-medium">{r.pedido}</TableCell>
                <TableCell>{r.fornecedor}</TableCell>
                <TableCell className="text-muted-foreground">{r.filial}</TableCell>
                <TableCell>
                  <PaStatusBadge status={r.status_compra} />
                </TableCell>
                <TableCell className="text-right">
                  {r.tot_qtde_original ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.tot_valor_original)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.emissao)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
