import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useFiscalQueue } from '@/lib/requisitions';
import { formatCurrency, formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableStatusRow } from '@/components/TableStatusRow';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/lib/use-pagination';

/**
 * Fila de CLASSIFICAÇÃO FISCAL — requisições aprovadas que ainda precisam da
 * classificação (CTB + natureza) antes de virar pedido. É a "revisão fiscal":
 * o revisor abre cada uma e classifica. Ao contrário da lista de Requisições
 * (own-only), aqui o revisor vê as de TODA a empresa — é função do papel.
 */
export function FiscalClassificationQueuePage() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useFiscalQueue({
    companyId: activeCompany?.id,
    search: search || undefined,
  });

  const rows = data?.data ?? [];
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Requisições aprovadas aguardando classificação fiscal (CTB +
          natureza) antes de virar pedido. Abra cada uma e classifique.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por número ou título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} aguardando` : 'Carregando…'}
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Aprovada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableStatusRow
                colSpan={6}
                isLoading={isLoading}
                isError={isError}
                isEmpty={rows.length === 0}
                emptyLabel="Nenhuma requisição aguardando classificação fiscal."
              />
              {pag.pageRows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/requisicoes/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.requester?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.supplierName}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.totalAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.approvedAt)}
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
