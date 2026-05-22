import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useFundRequests } from '@/lib/fund-requests';
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
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'REJECTED', label: 'Rejeitada' },
  { value: 'PENDING_ERP', label: 'Pendente ERP' },
  { value: 'INTEGRATED', label: 'Integrada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export function FundRequestsListPage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useFundRequests({
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
          {data ? `${data.total} solicitação(ões) de verba` : 'Carregando…'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportToCsv(
              `solicitacoes-verba-${new Date().toISOString().slice(0, 10)}`,
              [
                { header: 'Número', value: (sv) => sv.number },
                { header: 'Nº Linx', value: (sv) => sv.erpSolicitacao ?? '' },
                { header: 'Título', value: (sv) => sv.title },
                {
                  header: 'Pedido vinculado',
                  value: (sv) => sv.purchaseOrder?.number ?? '',
                },
                {
                  header: 'Solicitante',
                  value: (sv) => sv.requester?.name ?? '',
                },
                { header: 'Status', value: (sv) => sv.status },
                { header: 'Valor', value: (sv) => sv.totalAmount },
                { header: 'Criada em', value: (sv) => sv.createdAt },
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
              <TableHead>Nº Linx</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Pedido vinculado</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Criada em</TableHead>
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
                  Nenhuma solicitação de verba encontrada.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((sv) => (
              <TableRow
                key={sv.id}
                className="cursor-pointer"
                onClick={() => navigate(`/solicitacoes-verba/${sv.id}`)}
              >
                <TableCell className="font-medium">{sv.number}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {sv.erpSolicitacao ?? '—'}
                </TableCell>
                <TableCell>{sv.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {sv.purchaseOrder?.number ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {sv.requester?.name ?? '—'}
                </TableCell>
                <TableCell>
                  <StatusBadge status={sv.status} />
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(sv.totalAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(sv.createdAt)}
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
