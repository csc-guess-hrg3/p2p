import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  Eye,
  EyeOff,
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
  MyActionsCard,
  OrdersByMonthChart,
  OrdersByStatusChart,
  TopSuppliersChart,
} from './dashboard/widgets';

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
  { id: 'actions', label: 'Minhas ações' },
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
  const navigate = useNavigate();
  const companyId = activeCompany?.id;

  const summaryQ = useDashboardSummary(companyId);
  const openQ = useOpenOrders(companyId);
  const overdueQ = useOverdueOrders(companyId);
  const budgetQ = useBudgetConsumption(companyId);

  const [tab, setTab] = useState<'open' | 'overdue' | 'budget'>('open');
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

  const summary = summaryQ.data;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            {activeCompany?.name ?? 'Selecione uma empresa'} — atualizado
            automaticamente a cada 5 minutos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WIDGETS.map((w) => {
            const on = visible.has(w.id);
            return (
              <Button
                key={w.id}
                variant={on ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggle(w.id)}
              >
                {on ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {w.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          icon={ShoppingCart}
          label="Pedidos em aberto"
          value={
            summary
              ? String(summary.openOrders.count).padStart(2, '0')
              : '—'
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
            summary && summary.overdueOrders.count > 0 ? 'destructive' : 'default'
          }
          onClick={() => setTab('overdue')}
          active={tab === 'overdue'}
          loading={summaryQ.isLoading}
        />
        <KpiCard
          icon={PieIcon}
          label="Orçamento (mês)"
          value={
            summary
              ? fmtPct(summary.budgetConsumption.pctConsumed)
              : '—'
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
          onClick={() => setTab('budget')}
          active={tab === 'budget'}
          loading={summaryQ.isLoading}
        />
      </div>

      {/* Widgets visíveis — layout em grid 2 colunas a partir de lg. */}
      {visible.size > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.has('actions') && <MyActionsCard companyId={companyId} />}
          {visible.has('monthly') && <OrdersByMonthChart companyId={companyId} />}
          {visible.has('suppliers') && <TopSuppliersChart companyId={companyId} />}
          {visible.has('status') && <OrdersByStatusChart companyId={companyId} />}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="open">Em aberto</TabsTrigger>
          <TabsTrigger value="overdue">Em atraso</TabsTrigger>
          <TabsTrigger value="budget">Orçamento</TabsTrigger>
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

        <TabsContent value="budget">
          <Card>
            <CardHeader>
              <CardTitle>Orçamento por centro de custo</CardTitle>
            </CardHeader>
            <CardContent>
              <BudgetTable
                rows={budgetQ.data?.byCostCenter ?? []}
                loading={budgetQ.isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
