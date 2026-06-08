import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  BarChart3,
  PieChart as PieIcon,
  ShoppingCart,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useBudgetConsumption,
  useDashboardSummary,
  useOpenOrders,
  useOverdueOrders,
} from '@/lib/dashboard';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  OrdersByMonthChart,
  OrdersByStatusChart,
  TopSuppliersChart,
} from './dashboard/widgets';
import { PendingTasksPanel, MyRecentRequisitions } from './PendingTasksPage';
import { useAuth } from '@/lib/auth';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckItem,
} from '@/components/ui/dropdown-menu';

type KpiVariant = 'default' | 'warning' | 'destructive';

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  variant?: KpiVariant;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
}

const VARIANT_STYLES: Record<KpiVariant, string> = {
  default: 'border-border bg-card',
  warning: 'border-warning/40 bg-warning/5',
  destructive: 'border-destructive/40 bg-destructive/5',
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  variant = 'default',
  onClick,
  active,
  loading,
}: KpiProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-2 rounded-xl border p-5 text-left transition hover:shadow-sm ${VARIANT_STYLES[variant]} ${active ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <span className="text-2xl font-semibold text-foreground">{value}</span>
      )}
      {hint && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

function fmtPct(v: number | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

/* ----------------------------------------------------------------------
 * Configuração de widgets — persistida em localStorage para não resetar
 * a cada login. Cada widget tem uma chave estável (id).
 * -------------------------------------------------------------------- */
const WIDGETS = [
  { id: 'monthly', label: 'Pedidos por mês' },
  { id: 'suppliers', label: 'Top fornecedores' },
  { id: 'status', label: 'Pedidos por status' },
] as const;
type WidgetId = (typeof WIDGETS)[number]['id'];

const STORAGE_KEY = 'p2p:dashboard:widgets';

function loadVisible(): Set<WidgetId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(WIDGETS.map((w) => w.id));
    const arr = JSON.parse(raw) as WidgetId[];
    return new Set(arr);
  } catch {
    return new Set(WIDGETS.map((w) => w.id));
  }
}

export function DashboardPage() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = activeCompany?.id;

  // Panorama gerencial (KPIs, gráficos e tabelas da empresa) é só para
  // gestão — Admin e Manager. Operador/revisor recebe uma home centrada
  // nas próprias tarefas e requisições, sem métricas da companhia.
  const isManagement =
    user?.profile === 'ADMIN' || user?.profile === 'MANAGER';
  const isAdmin = user?.profile === 'ADMIN';

  // Só dispara as queries da empresa quando há audiência pra elas — passar
  // companyId=undefined desliga os hooks (enabled: !!companyId) e evita
  // chamadas (e 403) para quem não vê o panorama.
  const dashCompanyId = isManagement ? companyId : undefined;
  const summaryQ = useDashboardSummary(dashCompanyId);
  const openQ = useOpenOrders(dashCompanyId);
  const overdueQ = useOverdueOrders(dashCompanyId);
  const budgetQ = useBudgetConsumption(dashCompanyId);

  const [tab, setTab] = useState<'open' | 'overdue'>('open');
  const [visible, setVisible] = useState<Set<WidgetId>>(() => loadVisible());
  // Visão da empresa: por centro de custo (padrão) ou total consolidado
  // (opção só do admin). Não-admin sempre vê por CC.
  const [companyView, setCompanyView] = useState<'cc' | 'total'>('cc');
  const showTotal = isAdmin && companyView === 'total';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
  }, [visible]);

  function toggle(id: WidgetId) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const summary = summaryQ.data;

  // Operador / revisor: home enxuta, só o que é dele.
  if (!isManagement) {
    return (
      <div className="space-y-6 pb-10">
        <PendingTasksPanel companyId={companyId} />
        <MyRecentRequisitions companyId={companyId} />
      </div>
    );
  }

  // Gestão (Admin/Manager): pendências pessoais + panorama da empresa.
  return (
    <div className="space-y-6 pb-10">
      {/* Visão da empresa — primeiro bloco. Por centro de custo por padrão;
          o admin tem a opção de ver o total consolidado. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Visão da empresa
          </h2>
          <p className="text-xs text-muted-foreground">
            {activeCompany?.name ?? 'Selecione uma empresa'} —{' '}
            {showTotal
              ? 'total consolidado da empresa.'
              : 'por centro de custo (orçado · comprometido · consumido).'}
          </p>
        </div>
        {isAdmin && (
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setCompanyView('cc')}
              className={`rounded-md px-3 py-1.5 transition ${
                !showTotal
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Por centro de custo
            </button>
            <button
              type="button"
              onClick={() => setCompanyView('total')}
              className={`rounded-md px-3 py-1.5 transition ${
                showTotal
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Total
            </button>
          </div>
        )}
      </div>

      {showTotal ? (
        /* Visão TOTAL (admin) — KPIs consolidados da empresa. */
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            icon={ShoppingCart}
            label="Pedidos em aberto"
            value={
              summary ? String(summary.openOrders.count).padStart(2, '0') : '—'
            }
            hint={
              summary
                ? formatCurrency(summary.openOrders.totalAmount)
                : 'Aguardando dados…'
            }
            onClick={() => setTab('open')}
            active={tab === 'open'}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            icon={CalendarClock}
            label="Em atraso"
            value={
              summary
                ? String(summary.overdueOrders.count).padStart(2, '0')
                : '—'
            }
            hint={
              summary
                ? `${formatCurrency(summary.overdueOrders.totalAmount)} · ${fmtPct(summary.overdueOrders.pctOfOpenVolume)} do volume aberto`
                : 'Aguardando dados…'
            }
            variant={
              summary && summary.overdueOrders.count > 0
                ? 'destructive'
                : 'default'
            }
            onClick={() => setTab('overdue')}
            active={tab === 'overdue'}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            icon={PieIcon}
            label="Orçamento (mês)"
            value={
              summary ? fmtPct(summary.budgetConsumption.pctConsumed) : '—'
            }
            hint={
              summary
                ? `Consumido ${formatCurrency(summary.budgetConsumption.consumed)} de ${formatCurrency(summary.budgetConsumption.budgeted)}`
                : 'Aguardando dados…'
            }
            variant={
              summary && summary.budgetConsumption.pctConsumed > 90
                ? 'warning'
                : 'default'
            }
            onClick={() => setCompanyView('cc')}
            loading={summaryQ.isLoading}
          />
        </div>
      ) : (
        /* Visão POR CENTRO DE CUSTO (padrão) — orçado/comprometido/consumido
           por CC, do mês corrente. "Em atraso" só aparece na visão Total
           (admin), pois não é rastreado por CC. */
        <Card>
          <CardContent className="pt-6">
            <BudgetTable
              rows={budgetQ.data?.byCostCenter ?? []}
              loading={budgetQ.isLoading}
            />
          </CardContent>
        </Card>
      )}

      {/* Análises — cabeçalho enxuto + gráficos atrás de um menu discreto. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Análises</h2>
          <p className="text-xs text-muted-foreground">
            Atualizado a cada 5 minutos.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <BarChart3 className="size-3.5" />
              Gráficos
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mostrar gráficos</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {WIDGETS.map((w) => (
              <DropdownMenuCheckItem
                key={w.id}
                checked={visible.has(w.id)}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(w.id);
                }}
              >
                {w.label}
              </DropdownMenuCheckItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Gráficos visíveis — layout em grid 2 colunas a partir de lg. */}
      {visible.size > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.has('monthly') && <OrdersByMonthChart companyId={companyId} />}
          {visible.has('suppliers') && <TopSuppliersChart companyId={companyId} />}
          {visible.has('status') && <OrdersByStatusChart companyId={companyId} />}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Em aberto</TabsTrigger>
          <TabsTrigger value="overdue">Em atraso</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos em aberto</CardTitle>
            </CardHeader>
            <CardContent>
              <OrdersTable
                rows={openQ.data ?? []}
                loading={openQ.isLoading}
                emptyText="Nenhum pedido em aberto."
                onRowClick={(id) => navigate(`/pedidos/${id}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-destructive" />
                Pedidos em atraso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrdersTable
                rows={overdueQ.data ?? []}
                loading={overdueQ.isLoading}
                emptyText="Nenhum pedido em atraso."
                onRowClick={(id) => navigate(`/pedidos/${id}`)}
                highlightOverdue
              />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Minhas pendências — por último (gestor age sobre o que é dele
          depois de ver o panorama da empresa). */}
      <div className="border-t pt-6">
        <PendingTasksPanel companyId={companyId} />
      </div>
    </div>
  );
}

function OrdersTable({
  rows,
  loading,
  emptyText,
  onRowClick,
  highlightOverdue,
}: {
  rows: import('@/lib/dashboard').DashboardOrder[];
  loading: boolean;
  emptyText: string;
  onRowClick: (id: string) => void;
  highlightOverdue?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Filial</TableHead>
          <TableHead>Comprador</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Entrega</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              Carregando…
            </TableCell>
          </TableRow>
        )}
        {!loading && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow
            key={r.id}
            className="cursor-pointer"
            onClick={() => onRowClick(r.id)}
          >
            <TableCell className="font-medium">{r.number}</TableCell>
            <TableCell>{r.supplierName}</TableCell>
            <TableCell className="text-muted-foreground">{r.branchName}</TableCell>
            <TableCell className="text-muted-foreground">
              {r.buyer?.name ?? '—'}
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(r.totalAmount)}
            </TableCell>
            <TableCell
              className={
                highlightOverdue
                  ? 'font-medium text-destructive'
                  : 'text-muted-foreground'
              }
            >
              {formatDate(r.expectedDelivery)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BudgetTable({
  rows,
  loading,
}: {
  rows: import('@/lib/dashboard').BudgetByCostCenter[];
  loading: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Filial</TableHead>
          <TableHead>Centro de custo</TableHead>
          <TableHead className="text-right">Orçado</TableHead>
          <TableHead className="text-right">Comprometido</TableHead>
          <TableHead className="text-right">Consumido</TableHead>
          <TableHead className="text-right">% consumido</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              Carregando…
            </TableCell>
          </TableRow>
        )}
        {!loading && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              Sem orçamento lançado para o mês corrente.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={`${r.branchErpCode}-${r.costCenterErpCode}`}>
            <TableCell>{r.branchErpCode}</TableCell>
            <TableCell>{r.costCenterErpCode}</TableCell>
            <TableCell className="text-right">{formatCurrency(r.budgeted)}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(r.committed)}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(r.consumed)}</TableCell>
            <TableCell
              className={
                r.pctConsumed > 100
                  ? 'text-right font-medium text-destructive'
                  : r.pctConsumed > 90
                    ? 'text-right font-medium text-warning'
                    : 'text-right'
              }
            >
              {r.pctConsumed.toFixed(1)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
