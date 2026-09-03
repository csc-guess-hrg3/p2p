import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  BarChart3,
  PieChart as PieIcon,
  ShoppingCart,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useDashboardSummary,
  useOpenOrders,
  useOverdueOrders,
} from '@/lib/dashboard';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
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

  const isAdmin = user?.profile === 'ADMIN';
  const isManager = user?.profile === 'MANAGER';
  const isManagement = isAdmin || isManager;

  const [tab, setTab] = useState<'open' | 'overdue'>('open');
  const [visible, setVisible] = useState<Set<WidgetId>>(() => loadVisible());
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

  // Own-only em tudo (decisão PO): o dashboard mostra SEMPRE só os pedidos do
  // próprio usuário (comprador OU solicitante). Sem seletor equipe/todos — os
  // de outros, via modo SIMULAÇÃO. O backend ignora qualquer escopo enviado.
  const summaryQ = useDashboardSummary(companyId);
  const openQ = useOpenOrders(companyId, undefined, tab === 'open');
  const overdueQ = useOverdueOrders(companyId, undefined, tab === 'overdue');

  const summary = summaryQ.data;

  return (
    <div className="space-y-6 pb-10">
      {/* Sempre: o que é meu pra fazer. */}
      <PendingTasksPanel companyId={companyId} />

      {/* Pedidos — em aberto / em atraso, só os meus. */}
      <section className="space-y-4 border-t pt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Pedidos</h2>
            <p className="text-xs text-muted-foreground">Seus pedidos</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                ? `${formatCurrency(summary.overdueOrders.totalAmount)} · ${fmtPct(summary.overdueOrders.pctOfOpenVolume)} do volume`
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
          {/* Orçamento é métrica de EMPRESA — KPI só do admin (não é pedido de
              ninguém). O backend só devolve budgetConsumption para admin. */}
          {summary?.budgetConsumption && (
            <KpiCard
              icon={PieIcon}
              label="Orçamento (mês)"
              value={fmtPct(summary.budgetConsumption.pctConsumed)}
              hint={`Consumido ${formatCurrency(summary.budgetConsumption.consumed)} de ${formatCurrency(summary.budgetConsumption.budgeted)}`}
              variant={
                summary.budgetConsumption.pctConsumed > 90
                  ? 'warning'
                  : 'default'
              }
              loading={summaryQ.isLoading}
            />
          )}
        </div>

        {/* Drill-down: a tabela do KPI selecionado. */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="open">Em aberto</TabsTrigger>
            <TabsTrigger value="overdue">Em atraso</TabsTrigger>
          </TabsList>
          <TabsContent value="open">
            <Card>
              <CardContent className="pt-6">
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
              <CardContent className="pt-6">
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
      </section>

      {/* Minhas requisições recentes — pra todos. */}
      <MyRecentRequisitions companyId={companyId} />

      {/* Análises (gráficos) — só gestão. Os gráficos também são own-only no
          backend (mesmo recorte dos KPIs). */}
      {isManagement && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Análises
              </h2>
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
          {visible.size > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {visible.has('monthly') && (
                <OrdersByMonthChart companyId={companyId} />
              )}
              {visible.has('suppliers') && (
                <TopSuppliersChart companyId={companyId} />
              )}
              {visible.has('status') && (
                <OrdersByStatusChart companyId={companyId} />
              )}
            </div>
          )}
        </>
      )}
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
