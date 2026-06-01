import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Search } from 'lucide-react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  useFiscalDocuments,
  useFiscalSyncStatus,
  useTriggerFiscalSync,
  downloadFiscalXml,
  downloadFiscalDanfe,
  statusLabel,
  type FiscalDocStatus,
} from '@/lib/fiscal-documents';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import { formatCurrency, formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';
import { extractApiMessage } from '@/lib/api-errors';
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
import { StatusBadge } from '@/components/StatusBadge';
import { Pagination } from '@/components/ui/pagination';

const ALL = 'ALL';
const STATUS_OPTIONS: Array<{ value: typeof ALL | FiscalDocStatus; label: string }> = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'LINKED', label: 'Vinculadas (PC P2P)' },
  { value: 'LEGACY_LINKED', label: 'Vinculadas (Linx)' },
  { value: 'IGNORED', label: 'Ignoradas' },
  { value: 'INTERNAL', label: 'Transferências internas' },
  { value: ALL, label: 'Todas' },
];

export function FiscalDocumentsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [status, setStatus] = useState<typeof ALL | FiscalDocStatus>('PENDING');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>('emissao');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  const { data: syncStatus } = useFiscalSyncStatus(activeCompany?.id);

  const { data, isLoading, refetch, isFetching } = useFiscalDocuments({
    companyId: activeCompany?.id,
    status: status === ALL ? undefined : status,
    search: search || undefined,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const triggerSync = useTriggerFiscalSync();

  async function handleSync() {
    if (!activeCompany?.id) return;
    try {
      const res = await triggerSync.mutateAsync(activeCompany.id);
      const started = (res as any).started;
      const running = (res as any).running;
      toast({
        title: started
          ? 'Sincronização iniciada'
          : running
            ? 'Sincronização já em andamento'
            : 'Pronto',
        description: started
          ? 'Acompanhe o progresso no banner abaixo.'
          : 'Aguarde o sync atual terminar.',
      });
    } catch (err) {
      toast({
        title: 'Falha no sync',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  async function handleDownload(
    id: string,
    accessKey: string,
    kind: 'xml' | 'danfe',
  ) {
    try {
      if (kind === 'xml') await downloadFiscalXml({ id, accessKey });
      else await downloadFiscalDanfe({ id, accessKey });
    } catch (err) {
      toast({
        title: 'Falha no download',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notas Fiscais (Qive)</h1>
          <p className="text-sm text-muted-foreground">
            NFes baixadas da Qive — vincule manualmente ao pedido.
            Sincronização e listagem filtradas pela empresa{' '}
            <span className="font-medium">{activeCompany?.code}</span>{' '}
            (CNPJs da empresa apenas).
          </p>
        </div>
        <div className="flex gap-2">
          {user?.profile === 'ADMIN' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={triggerSync.isPending || syncStatus?.running}
              title="Sincroniza com a Qive — traz NFs de todas as empresas da conta"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  syncStatus?.running ? 'animate-spin' : ''
                }`}
              />
              {syncStatus?.running
                ? 'Sincronizando…'
                : `Sincronizar Qive (${activeCompany?.code ?? ''})`}
            </Button>
          )}
        </div>
      </div>

      {/* Banner de progresso do sync — só aparece quando rodando. */}
      {syncStatus?.running && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium text-blue-900">
              Sincronizando {activeCompany?.code} com a Qive…
            </div>
            <div className="text-xs text-blue-800">
              {syncStatus.totalOnQive
                ? `${syncStatus.totalOnQive.toLocaleString('pt-BR')} NFs da empresa na Qive`
                : 'verificando total…'}
            </div>
          </div>
          {syncStatus.totalOnQive ? (
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-blue-100">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((syncStatus.nfesInserted +
                        syncStatus.nfesAlreadyExisted +
                        syncStatus.nfesIgnored) /
                        syncStatus.totalOnQive) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
          ) : null}
          <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-blue-800 md:grid-cols-3">
            <div>
              <span className="font-medium">{syncStatus.nfesInserted.toLocaleString('pt-BR')}</span>{' '}
              novas neste sync
            </div>
            <div>
              <span className="font-medium">{syncStatus.nfesAlreadyExisted.toLocaleString('pt-BR')}</span>{' '}
              já estavam no P2P
            </div>
            <div>
              <span className="font-medium">{syncStatus.nfesIgnored.toLocaleString('pt-BR')}</span>{' '}
              ignoradas (CNPJ fora da empresa)
            </div>
          </div>
          <div className="mt-1 text-xs text-blue-700">
            Página {syncStatus.pagesProcessed} • {syncStatus.totalLocal.toLocaleString('pt-BR')}{' '}
            NFs de {activeCompany?.code} no banco
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div className="w-48">
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof ALL | FiscalDocStatus);
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
          <Label className="text-xs">Buscar (nº, chave ou fornecedor)</Label>
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
              placeholder="Ex.: 12345 ou 35260..."
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
              <TableHead>
                <SortHead col="emissao" current={sortBy} dir={sortDir} onToggle={toggleSort}>Emissão</SortHead>
              </TableHead>
              <TableHead>
                <SortHead col="numero" current={sortBy} dir={sortDir} onToggle={toggleSort}>Nº NF</SortHead>
              </TableHead>
              <TableHead>
                <SortHead col="supplierName" current={sortBy} dir={sortDir} onToggle={toggleSort}>Fornecedor</SortHead>
              </TableHead>
              <TableHead>
                <SortHead col="destName" current={sortBy} dir={sortDir} onToggle={toggleSort}>Filial destino</SortHead>
              </TableHead>
              <TableHead className="text-right">
                <SortHead col="valorTotal" current={sortBy} dir={sortDir} onToggle={toggleSort} align="right">Valor</SortHead>
              </TableHead>
              <TableHead>
                <SortHead col="status" current={sortBy} dir={sortDir} onToggle={toggleSort}>Status</SortHead>
              </TableHead>
              <TableHead>PC vinculado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhuma NF encontrada com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => navigate(`/fiscal/notas-fiscais/${row.id}`)}
                >
                  <TableCell>{formatDate(row.emissao)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.numero}
                    {row.serie ? `/${row.serie}` : ''}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.supplierName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCnpj(row.supplierCnpj)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{row.destName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCnpj(row.destCnpj)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.valorTotal)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={statusLabel(row.status)} />
                  </TableCell>
                  <TableCell>
                    {row.purchaseOrder ? (
                      <button
                        className="text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/pedidos-compra/${row.purchaseOrder!.id}`,
                          );
                        }}
                      >
                        {row.purchaseOrder.number}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Baixar XML"
                      onClick={() =>
                        handleDownload(row.id, row.accessKey, 'xml')
                      }
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-1 text-xs">XML</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Baixar DANFe"
                      onClick={() =>
                        handleDownload(row.id, row.accessKey, 'danfe')
                      }
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-1 text-xs">PDF</span>
                    </Button>
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

function SortHead({
  col,
  current,
  dir,
  onToggle,
  align,
  children,
}: {
  col: string;
  current: string;
  dir: 'asc' | 'desc';
  onToggle: (c: string) => void;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const active = current === col;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(col)}
      className={`inline-flex w-full items-center gap-1 hover:text-foreground ${
        align === 'right' ? 'justify-end' : ''
      } ${active ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      {children}
      <Icon className="h-3 w-3" />
    </button>
  );
}

function formatCnpj(raw: string): string {
  const c = raw.replace(/\D/g, '');
  if (c.length !== 14) return raw;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(
    8,
    12,
  )}-${c.slice(12)}`;
}
