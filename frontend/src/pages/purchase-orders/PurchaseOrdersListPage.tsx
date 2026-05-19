import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
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

  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data ? `${data.total} pedido(s) de compra` : 'Carregando…'}
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
              <TableHead>Fornecedor</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Comprador</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Criado em</TableHead>
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
                  Nenhum pedido de compra encontrado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((po) => (
              <TableRow
                key={po.id}
                className="cursor-pointer"
                onClick={() => navigate(`/pedidos/${po.id}`)}
              >
                <TableCell className="font-medium">{po.number}</TableCell>
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
                <TableCell className="text-muted-foreground">
                  {formatDate(po.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
