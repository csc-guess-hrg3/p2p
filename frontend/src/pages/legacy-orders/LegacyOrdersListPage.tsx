import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, FileText } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useLegacyOrders } from '@/lib/legacy-orders';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Em aberto (com saldo)' },
  { value: 'CLOSED', label: 'Fechados (sem saldo)' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'ALL', label: 'Todos' },
];

/**
 * Pedidos Legados — pedidos consumível direto do Linx (pré-P2P + atuais).
 * Tela admin: lê COMPRAS + COMPRAS_CONSUMIVEL via cross-db, mostra
 * contagem de NFs (ENTRADAS_ITEM) pra cada pedido.
 */
export function LegacyOrdersListPage() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL'>(
    'OPEN',
  );
  const [onlyWithNfe, setOnlyWithNfe] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading, isFetching, refetch } = useLegacyOrders({
    companyId: activeCompany?.id ?? '',
    search: search || undefined,
    status,
    onlyWithNfe,
    page,
    pageSize,
  });

  if (!activeCompany) {
    return (
      <div className="p-6 text-muted-foreground">
        Selecione uma empresa no topo para listar os pedidos do Linx.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos Legados</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos de consumível direto do Linx ({activeCompany.code}). Inclui
          pedidos pré-P2P e os ativos atuais. Tela só de consulta.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div className="w-56">
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger>
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
        <div className="flex-1 min-w-64">
          <Label className="text-xs">Buscar (pedido ou fornecedor)</Label>
          <div className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(searchInput);
                  setPage(1);
                }
              }}
              placeholder="Ex.: 61097 ou LIMP QUALITY"
            />
            <Button
              variant="secondary"
              onClick={() => {
                setSearch(searchInput);
                setPage(1);
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWithNfe}
            onChange={(e) => {
              setOnlyWithNfe(e.target.checked);
              setPage(1);
            }}
          />
          Só com NF
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
          />
          Atualizar
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emissão</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Tipo de compra</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">A entregar</TableHead>
              <TableHead className="text-center">NFs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground"
                >
                  Consultando Linx…
                </TableCell>
              </TableRow>
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground"
                >
                  Nenhum pedido encontrado com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow
                  key={row.pedido}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() =>
                    navigate(
                      `/legacy-orders/${activeCompany.id}/${row.pedido}`,
                    )
                  }
                >
                  <TableCell>{formatDate(row.emissao)}</TableCell>
                  <TableCell className="font-mono">{row.pedido}</TableCell>
                  <TableCell>{row.fornecedor}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.filialAEntregar ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.tipoCompra ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.totValorOriginal)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.totValorEntregar > 0 ? (
                      <span className="text-amber-700">
                        {formatCurrency(row.totValorEntregar)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.nfeCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        <FileText className="h-3 w-3" />
                        {row.nfeCount}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          totalPages={Math.max(1, Math.ceil(data.total / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
