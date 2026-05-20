import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data ? `${data.total} recebimento(s)` : 'Carregando…'}
      </p>

      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por número…"
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
            {rows.map((r) => (
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
    </div>
  );
}
