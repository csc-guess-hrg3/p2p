import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, Plus, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useRequisitions } from '@/lib/requisitions';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { ScopeSelect, useScope } from '@/components/ScopeSelect';
import { Button } from '@/components/ui/button';
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

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'SUBMITTED', label: 'Enviada' },
  { value: 'IN_APPROVAL', label: 'Em aprovação' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'REJECTED', label: 'Rejeitada' },
  { value: 'CONVERTED', label: 'Convertida' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export function RequisitionsListPage() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.profile === 'ADMIN';
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useScope('p2p:scope:requisicoes', isAdmin);

  const { data, isLoading } = useRequisitions({
    companyId: activeCompany?.id,
    status: status === 'ALL' ? undefined : status,
    search: search || undefined,
    scope,
  });

  const rows = data?.data ?? [];
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} requisição(ões)` : 'Carregando…'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCsv(
                `requisicoes-${new Date().toISOString().slice(0, 10)}`,
                [
                  { header: 'Número', value: (r) => r.number },
                  { header: 'Título', value: (r) => r.title },
                  { header: 'Fornecedor', value: (r) => r.supplierName },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Valor', value: (r) => r.totalAmount },
                  { header: 'Criada em', value: (r) => r.createdAt },
                ],
                rows,
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            Exportar
          </Button>
          <Button asChild>
            <Link to="/requisicoes/nova">
              <Plus className="size-4" />
              Nova requisição
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por número ou título…"
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
        <ScopeSelect
          value={scope}
          onChange={setScope}
          canSeeAll={isAdmin}
          showTeam={!!user?.teamId}
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Adiantamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Criada em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma requisição encontrada.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => navigate(`/requisicoes/${r.id}`)}
              >
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.supplierName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.tipoNotaFiscal === 'NF_FUTURA' ? 'Sim' : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    {r.status === 'APPROVED' &&
                      r.tipoNotaFiscal !== 'SEM_NF' &&
                      (r.ctbTipoOperacao == null || !r.naturezaEntrada) && (
                        <span
                          title="Classificação fiscal pendente — preencher antes de virar pedido"
                          className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
                        >
                          <AlertTriangle className="size-3" />
                          Fiscal
                        </span>
                      )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.totalAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.createdAt)}
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
