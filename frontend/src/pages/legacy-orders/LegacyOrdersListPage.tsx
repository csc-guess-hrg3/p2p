import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Filter,
  RefreshCw,
  Search,
  FileText,
  X,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useLegacyOrders,
  useLegacyOrderFacets,
  type LegacyOrderQuery,
} from '@/lib/legacy-orders';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
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

/**
 * Pedidos Legados — pedidos consumível direto do Linx (pré-P2P + atuais).
 *
 * Estado dos filtros vive na URL (search params) — assim, ao entrar num
 * pedido e voltar (browser back), todos os filtros se preservam, e
 * a URL é compartilhável/bookmarkável.
 */

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Em aberto (com saldo)' },
  { value: 'CLOSED', label: 'Fechados (sem saldo)' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'ALL', label: 'Todos' },
] as const;

const STATUS_APROV_OPTIONS = [
  { value: 'ANY', label: 'Qualquer' },
  { value: 'A', label: 'Aprovado' },
  { value: 'P', label: 'Pendente' },
  { value: 'R', label: 'Reprovado' },
  { value: 'E', label: 'Em análise' },
] as const;

const ANY = '__ANY__';

export function LegacyOrdersListPage() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [params, setParams] = useSearchParams();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Lê tudo da URL — fonte única da verdade.
  const status =
    (params.get('status') as 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL') ||
    'OPEN';
  const search = params.get('search') ?? '';
  const nfeFilter =
    (params.get('nfeFilter') as 'any' | 'with-nf' | 'with-chave') ?? 'any';
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 50);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const valorMin = params.get('valorMin') ?? '';
  const valorMax = params.get('valorMax') ?? '';
  const filial = params.get('filial') ?? '';
  const tipoCompra = params.get('tipoCompra') ?? '';
  const requeridoPor = params.get('requeridoPor') ?? '';
  const aprovadoPor = params.get('aprovadoPor') ?? '';
  const statusAprovacao = params.get('statusAprovacao') ?? '';

  const [searchInput, setSearchInput] = useState(search);

  function updateParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value) next.delete(key);
        else next.set(key, value);
        // Qualquer mudança de filtro reseta página
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function setMany(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (!v) next.delete(k);
          else next.set(k, v);
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function clearAdvanced() {
    setMany({
      from: null,
      to: null,
      valorMin: null,
      valorMax: null,
      filial: null,
      tipoCompra: null,
      requeridoPor: null,
      aprovadoPor: null,
      statusAprovacao: null,
    });
  }

  const query: LegacyOrderQuery = {
    companyId: activeCompany?.id ?? '',
    search: search || undefined,
    status,
    statusAprovacao: (statusAprovacao || undefined) as
      | 'A'
      | 'P'
      | 'R'
      | 'E'
      | undefined,
    nfeFilter: nfeFilter === 'any' ? undefined : nfeFilter,
    from: from || undefined,
    to: to || undefined,
    valorMin: valorMin ? Number(valorMin) : undefined,
    valorMax: valorMax ? Number(valorMax) : undefined,
    filial: filial || undefined,
    tipoCompra: tipoCompra || undefined,
    requeridoPor: requeridoPor || undefined,
    aprovadoPor: aprovadoPor || undefined,
    page,
    pageSize,
  };

  const { data, isLoading, isFetching, refetch } = useLegacyOrders(query);
  const { data: facets } = useLegacyOrderFacets(activeCompany?.id);

  const advancedActiveCount = useMemo(
    () =>
      [
        from,
        to,
        valorMin,
        valorMax,
        filial,
        tipoCompra,
        requeridoPor,
        aprovadoPor,
        statusAprovacao,
      ].filter(Boolean).length,
    [
      from,
      to,
      valorMin,
      valorMax,
      filial,
      tipoCompra,
      requeridoPor,
      aprovadoPor,
      statusAprovacao,
    ],
  );

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
        <h1 className="text-2xl font-semibold">Pedidos do Linx</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos de consumível que não foram feitos pelo P2P (BPM, Fusion
          ou cadastro direto no Linx). Inclui pedidos ativos e fechados.
          Tela só de consulta — empresa {activeCompany.code}.
        </p>
      </div>

      {/* Linha 1 — filtros básicos */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div className="w-56">
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => updateParam('status', v)}
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
                if (e.key === 'Enter') updateParam('search', searchInput);
              }}
              placeholder="Ex.: 61097 ou LIMP QUALITY"
            />
            <Button
              variant="secondary"
              onClick={() => updateParam('search', searchInput)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="w-56">
          <Label className="text-xs">Filtro de NF</Label>
          <Select
            value={nfeFilter}
            onValueChange={(v) =>
              updateParam('nfeFilter', v === 'any' ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Qualquer (sem filtro)</SelectItem>
              <SelectItem value="with-nf">Com NF lançada (Linx)</SelectItem>
              <SelectItem value="with-chave">
                Com chave NFe (consultável na Qive)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filtros avançados
          {advancedActiveCount > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {advancedActiveCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              'ml-1 h-4 w-4 transition-transform',
              advancedOpen && 'rotate-180',
            )}
          />
        </Button>
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

      {/* Painel — filtros avançados (colapsável) */}
      {advancedOpen && (
        <div className="space-y-3 rounded-md border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Emissão de</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => updateParam('from', e.target.value || null)}
              />
            </div>
            <div>
              <Label className="text-xs">Emissão até</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => updateParam('to', e.target.value || null)}
              />
            </div>
            <div>
              <Label className="text-xs">Valor mín. (R$)</Label>
              <CurrencyInput
                value={valorMin ? Number(valorMin) : null}
                onChange={(v) =>
                  updateParam('valorMin', v != null ? String(v) : null)
                }
                nullable
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Valor máx. (R$)</Label>
              <CurrencyInput
                value={valorMax ? Number(valorMax) : null}
                onChange={(v) =>
                  updateParam('valorMax', v != null ? String(v) : null)
                }
                nullable
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Filial</Label>
              <Select
                value={filial || ANY}
                onValueChange={(v) =>
                  updateParam('filial', v === ANY ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Qualquer</SelectItem>
                  {(facets?.filiais ?? []).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de compra</Label>
              <Select
                value={tipoCompra || ANY}
                onValueChange={(v) =>
                  updateParam('tipoCompra', v === ANY ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Qualquer</SelectItem>
                  {(facets?.tiposCompra ?? []).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status aprovação</Label>
              <Select
                value={statusAprovacao || 'ANY'}
                onValueChange={(v) =>
                  updateParam('statusAprovacao', v === 'ANY' ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_APROV_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aprovador</Label>
              <Select
                value={aprovadoPor || ANY}
                onValueChange={(v) =>
                  updateParam('aprovadoPor', v === ANY ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Qualquer</SelectItem>
                  {(facets?.aprovadores ?? []).map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Requerido por (contém)</Label>
              <Input
                value={requeridoPor}
                onChange={(e) =>
                  updateParam('requeridoPor', e.target.value || null)
                }
                placeholder="Ex.: camila"
              />
            </div>
          </div>
          {advancedActiveCount > 0 && (
            <div>
              <Button variant="ghost" size="sm" onClick={clearAdvanced}>
                <X className="mr-2 h-4 w-4" />
                Limpar filtros avançados
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emissão</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Tipo de compra</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">A entregar</TableHead>
              <TableHead className="text-center">NFs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                >
                  Consultando Linx…
                </TableCell>
              </TableRow>
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center">
                  <div className="text-muted-foreground">
                    Nenhum pedido encontrado com esses filtros.
                  </div>
                  {nfeFilter === 'with-chave' && status === 'OPEN' && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Dica: pedidos com NF baixada geralmente já foram
                      entregues (saldo zerado). Tente trocar o status para{' '}
                      <button
                        className="text-primary underline"
                        onClick={() => updateParam('status', 'ALL')}
                      >
                        Todos
                      </button>{' '}
                      ou{' '}
                      <button
                        className="text-primary underline"
                        onClick={() => updateParam('status', 'CLOSED')}
                      >
                        Fechados
                      </button>
                      .
                    </div>
                  )}
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
                  <TableCell className="text-xs">
                    {row.statusCompra ?? '—'}
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
                      <span
                        className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        title={`${row.nfeCount} NF lançada(s) no Linx — ${row.nfeWithChaveCount} com chave NFe`}
                      >
                        <FileText className="h-3 w-3" />
                        {row.nfeWithChaveCount}/{row.nfeCount}
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
          onPageChange={(p) => updateParam('page', String(p))}
          onPageSizeChange={(s) => setMany({ pageSize: String(s) })}
        />
      )}
    </div>
  );
}
