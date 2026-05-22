import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { usePurchaseOrders } from '@/lib/purchase-orders';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
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
import { exportToCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'SENT_TO_SUPPLIER', label: 'Enviado ao fornecedor' },
  { value: 'PARTIALLY_RECEIVED', label: 'Recebido parcial' },
  { value: 'FULLY_RECEIVED', label: 'Recebido total' },
  { value: 'PENDING_ERP', label: 'Pendente ERP' },
  { value: 'INTEGRATED', label: 'Integrado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

export function PurchaseOrdersListPage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = usePurchaseOrders({
    companyId: activeCompany?.id,
    status: status === 'ALL' ? undefined : status,
    search: search || undefined,
  });

  // Sinalização visual (PRD § 8.5): atrasados em vermelho, vencimento ≤ 7d
  // em amarelo, no prazo em verde. Atrasados sobem para o topo (US-OC-01).
  const FINALIZED = ['FULLY_RECEIVED', 'CANCELLED', 'INTEGRATED'];
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const rows = useMemo(() => {
    const raw = data?.data ?? [];
    const now = Date.now();
    const enriched = raw.map((po) => {
      const due = po.expectedDelivery
        ? new Date(po.expectedDelivery).getTime()
        : null;
      const isOpen = !FINALIZED.includes(po.status);
      let deliveryFlag: 'overdue' | 'soon' | 'ok' | 'none' = 'none';
      if (due != null && isOpen) {
        if (due < now) deliveryFlag = 'overdue';
        else if (due - now <= SEVEN_DAYS_MS) deliveryFlag = 'soon';
        else deliveryFlag = 'ok';
      }
      return { ...po, deliveryFlag };
    });
    // Atrasados primeiro (mais antigos no topo), depois "vencendo logo",
    // depois o restante por createdAt desc (já vem ordenado do backend).
    enriched.sort((a, b) => {
      const order = { overdue: 0, soon: 1, ok: 2, none: 3 } as const;
      const oa = order[a.deliveryFlag];
      const ob = order[b.deliveryFlag];
      if (oa !== ob) return oa - ob;
      if (a.deliveryFlag === 'overdue' && a.expectedDelivery && b.expectedDelivery) {
        return (
          new Date(a.expectedDelivery).getTime() -
          new Date(b.expectedDelivery).getTime()
        );
      }
      return 0;
    });
    return enriched;
  }, [data?.data]);
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} pedido(s) de compra` : 'Carregando…'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(
              `pedidos-compra-${new Date().toISOString().slice(0, 10)}`,
              [
                { header: 'Número', value: (po) => po.number },
                { header: 'Fornecedor', value: (po) => po.supplierName },
                { header: 'Filial', value: (po) => po.branchName },
                { header: 'Comprador', value: (po) => po.buyer?.name ?? '' },
                { header: 'Status', value: (po) => po.status },
                { header: 'Valor', value: (po) => po.totalAmount },
                { header: 'Entrega prevista', value: (po) => po.expectedDelivery },
                { header: 'Criado em', value: (po) => po.createdAt },
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
            placeholder="Buscar por número…"
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
              <TableHead>Número</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Entrega prevista</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum pedido de compra encontrado.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((po) => {
              const deliveryClass =
                po.deliveryFlag === 'overdue'
                  ? 'font-medium text-destructive'
                  : po.deliveryFlag === 'soon'
                    ? 'font-medium text-warning'
                    : po.deliveryFlag === 'ok'
                      ? 'text-emerald-600'
                      : 'text-muted-foreground';
              return (
                <TableRow
                  key={po.id}
                  className={`cursor-pointer ${po.deliveryFlag === 'overdue' ? 'bg-destructive/5 hover:bg-destructive/10' : ''}`}
                  onClick={() => navigate(`/pedidos/${po.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {po.deliveryFlag === 'overdue' && (
                        <AlertTriangle className="size-4 text-destructive" />
                      )}
                      {po.number}
                    </div>
                  </TableCell>
                  <TableCell>{po.supplierName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {po.branchName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {po.buyer?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={po.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(po.totalAmount)}
                  </TableCell>
                  <TableCell className={deliveryClass}>
                    {formatDate(po.expectedDelivery)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(po.createdAt)}
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
