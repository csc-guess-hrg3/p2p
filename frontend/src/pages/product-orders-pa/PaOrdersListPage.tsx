import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, Search } from 'lucide-react';
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
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/lib/use-pagination';
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';

/** Tradução dos códigos do COMPRAS_STATUS para rótulo e cor. */
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

function PaStatusBadge({ status }: { status: string }) {
  const key = (status ?? '').trim().toUpperCase();
  const meta = STATUS_MAP[key] ?? { label: key, variant: 'neutral' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

// O fluxo de PA passa direto de 'E' (em estudo, criado por Compras no
// ERP) para 'A' (aprovado pelo diretor da marca). Status 'P' não é
// usado neste cliente — mantido aqui só pelo label caso apareça.
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'E', label: 'Aguardando aprovação' },
  { value: 'A', label: 'Aprovados' },
  { value: 'D', label: 'Entregues' },
  { value: 'DP', label: 'Entregues parcialmente' },
  { value: 'R', label: 'Reprovados' },
  { value: 'C', label: 'Cancelados' },
  { value: 'CP', label: 'Cancelados parcialmente' },
];

export function PaOrdersListPage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data: rawRows = [], isLoading } = usePaOrders(activeCompany?.code, {
    status,
    search: search || undefined,
  });

  // Sinalização de atraso: usa `proxima_entrega` (item mais antigo com saldo).
  // Pedidos "fechados" (entregues / cancelados / reprovados) não sinalizam.
  // Atrasados sobem pro topo da lista (regra de produto).
  const CLOSED = ['D', 'C', 'R'];
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const rows = useMemo(() => {
    const now = Date.now();
    const enriched = rawRows.map((r) => {
      const eff = (r.status_efetivo ?? r.status_compra ?? '').trim();
      const isOpen = !CLOSED.includes(eff);
      const due = r.proxima_entrega ? new Date(r.proxima_entrega).getTime() : null;
      let deliveryFlag: 'overdue' | 'soon' | 'ok' | 'none' = 'none';
      if (isOpen && due != null) {
        if (due < now) deliveryFlag = 'overdue';
        else if (due - now <= SEVEN_DAYS_MS) deliveryFlag = 'soon';
        else deliveryFlag = 'ok';
      }
      return { ...r, deliveryFlag };
    });
    enriched.sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, none: 3 } as const;
      const oa = order[a.deliveryFlag];
      const ob = order[b.deliveryFlag];
      if (oa !== ob) return oa - ob;
      // Mesmo bucket: mais atrasado primeiro (data menor antes).
      if (a.deliveryFlag === 'overdue' && a.proxima_entrega && b.proxima_entrega) {
        return (
          new Date(a.proxima_entrega).getTime() -
          new Date(b.proxima_entrega).getTime()
        );
      }
      return 0;
    });
    return enriched;
  }, [rawRows]);
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Pedidos de compra de <strong>produto acabado</strong> — nascem no ERP
          e ficam aqui para aprovação do diretor da marca.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(
              `produto-acabado-${new Date().toISOString().slice(0, 10)}`,
              [
                { header: 'Pedido', value: (r) => r.pedido },
                { header: 'Fornecedor', value: (r) => r.fornecedor },
                { header: 'Filial', value: (r) => r.filial },
                {
                  header: 'Status',
                  value: (r) => r.status_efetivo ?? r.status_compra,
                },
                { header: 'Qtde', value: (r) => r.tot_qtde_original },
                { header: 'Valor', value: (r) => r.tot_valor_original },
                { header: 'Emissão', value: (r) => r.emissao },
                { header: 'Próxima entrega', value: (r) => r.proxima_entrega },
                { header: 'NF', value: (r) => r.first_nf },
              ],
              rows,
            )
          }
          disabled={rows.length === 0}
        >
          <Download className="size-4" />
          Exportar
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por número ou fornecedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-56">
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
        <div className="overflow-x-auto">
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
              <TableHead>Próxima entrega</TableHead>
              <TableHead>Nota fiscal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-8 text-center text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum pedido encontrado.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((r) => {
              const deliveryClass =
                r.deliveryFlag === 'overdue'
                  ? 'font-medium text-destructive'
                  : r.deliveryFlag === 'soon'
                    ? 'font-medium text-warning'
                    : r.deliveryFlag === 'ok'
                      ? 'text-emerald-600'
                      : 'text-muted-foreground';
              return (
                <TableRow
                  key={r.pedido}
                  className={`cursor-pointer ${r.deliveryFlag === 'overdue' ? 'bg-destructive/5 hover:bg-destructive/10' : ''}`}
                  onClick={() => navigate(`/pedidos-pa/${r.pedido}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.deliveryFlag === 'overdue' && (
                        <AlertTriangle className="size-4 text-destructive" />
                      )}
                      {r.pedido}
                    </div>
                  </TableCell>
                  <TableCell>{r.fornecedor}</TableCell>
                  <TableCell className="text-muted-foreground">{r.filial}</TableCell>
                  <TableCell>
                    <PaStatusBadge status={r.status_efetivo ?? r.status_compra} />
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
                  <TableCell className={deliveryClass}>
                    {r.was_rescheduled ? (
                      <span title={`Original: ${formatDate(r.proxima_entrega_original)}`}>
                        {formatDate(r.proxima_entrega)}
                        <span className="ml-1 text-xs italic text-muted-foreground">
                          (reagendada)
                        </span>
                      </span>
                    ) : (
                      formatDate(r.proxima_entrega)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.nfs_count && r.nfs_count > 1
                      ? `${r.nfs_count} notas`
                      : r.first_nf || '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        <Pagination
          page={pag.page}
          pageSize={pag.pageSize}
          total={pag.total}
          totalPages={pag.totalPages}
          onPageChange={pag.setPage}
          onPageSizeChange={pag.setPageSize}
        />
      </div>
    </div>
  );
}
