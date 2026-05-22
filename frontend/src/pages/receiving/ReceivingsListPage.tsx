import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useReceivings } from '@/lib/receiving';
import { formatDate } from '@/lib/format';
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
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'DIVERGENT', label: 'Divergente' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

export function ReceivingsListPage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useReceivings({
    companyId: activeCompany?.id,
    status: status === 'ALL' ? undefined : status,
    search: search || undefined,
  });

  const rows = data?.data ?? [];
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} recebimento(s)` : 'Carregando…'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(
              `recebimentos-${new Date().toISOString().slice(0, 10)}`,
              [
                { header: 'Número', value: (r) => r.number },
                {
                  header: 'Pedido',
                  value: (r) => r.purchaseOrder?.number ?? '',
                },
                {
                  header: 'Recebido por',
                  value: (r) => r.receivedBy?.name ?? '',
                },
                { header: 'Recebido em', value: (r) => r.receivedAt },
                { header: 'Status', value: (r) => r.status },
                { header: 'Confirmado em', value: (r) => r.confirmedAt },
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
              <TableHead>Pedido</TableHead>
              <TableHead>Recebido por</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Confirmado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum recebimento encontrado.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => navigate(`/recebimentos/${r.id}`)}
              >
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.purchaseOrder?.number ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.receivedBy?.name ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.receivedAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.confirmedAt)}
                </TableCell>
              </TableRow>
            ))}
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
