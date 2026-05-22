import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckSquare,
  ClipboardCheck,
  FileText,
  Shirt,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import {
  useMyActions,
  useOrdersByMonth,
  useOrdersByStatus,
  useTopSuppliers,
} from '@/lib/dashboard';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MONTH_LABEL = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Aprovado',
  SENT_TO_SUPPLIER: 'Enviado',
  PARTIALLY_RECEIVED: 'Receb. parcial',
  FULLY_RECEIVED: 'Recebido',
  PENDING_ERP: 'Pendente ERP',
  INTEGRATED: 'Integrado',
  CANCELLED: 'Cancelado',
};

// Palette consistente com a paleta primária do app.
const PIE_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#f59e0b', // amber
  '#dc2626', // red
  '#a855f7', // purple
  '#0891b2', // cyan
  '#64748b', // slate
  '#facc15', // yellow
];

/* ============================================================
 * WIDGET 1 — Tendência mensal
 * ============================================================ */
export function OrdersByMonthChart({ companyId }: { companyId?: string }) {
  const { data = [], isLoading } = useOrdersByMonth(companyId);
  const chartData = data.map((d) => ({
    name: `${MONTH_LABEL[d.month - 1]}/${String(d.year).slice(2)}`,
    pedidos: d.count,
    valor: d.total,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" />
          Pedidos por mês (últimos 6)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : chartData.every((d) => d.pedidos === 0) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem pedidos no período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(v: number, name) =>
                  name === 'valor' ? formatCurrency(v) : v
                }
              />
              <Area
                type="monotone"
                dataKey="pedidos"
                stroke="#2563eb"
                fill="url(#grad)"
                strokeWidth={2}
                name="pedidos"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * WIDGET 2 — Top fornecedores
 * ============================================================ */
export function TopSuppliersChart({ companyId }: { companyId?: string }) {
  const { data = [], isLoading } = useTopSuppliers(companyId);
  // Abrevia nomes longos pro eixo Y; tooltip mostra o nome completo.
  const chartData = data.map((d) => ({
    ...d,
    short: d.supplier.length > 22 ? d.supplier.slice(0, 20) + '…' : d.supplier,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="size-4" />
          Top fornecedores (mês corrente)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem pedidos no mês.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <XAxis
                type="number"
                fontSize={12}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <YAxis
                type="category"
                dataKey="short"
                fontSize={12}
                width={160}
                interval={0}
              />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(_l, payload) =>
                  payload?.[0]?.payload?.supplier ?? ''
                }
              />
              <Bar dataKey="total" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * WIDGET 3 — Pedidos por status (donut)
 * ============================================================ */
export function OrdersByStatusChart({ companyId }: { companyId?: string }) {
  const { data = [], isLoading } = useOrdersByStatus(companyId);
  const chartData = data.map((d) => ({
    status: STATUS_LABEL[d.status] ?? d.status,
    value: d.count,
    total: d.total,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4" />
          Pedidos por status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem pedidos.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, _n, p) =>
                  `${v} pedido(s) · ${formatCurrency(p?.payload?.total ?? 0)}`
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                iconSize={8}
                layout="horizontal"
                align="center"
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * WIDGET 4 — Minhas ações pendentes
 * ============================================================ */
export function MyActionsCard({ companyId }: { companyId?: string }) {
  const { data, isLoading } = useMyActions(companyId);

  const items = [
    {
      label: 'Aprovações aguardando você',
      count: data?.approvalsPending ?? 0,
      icon: CheckSquare,
      to: '/aprovacoes',
    },
    {
      label: 'Pedidos PA pra aprovar',
      count: data?.paPending ?? 0,
      icon: Shirt,
      to: '/pedidos-pa?status=E',
    },
    {
      label: 'Pendências fiscais',
      count: data?.fiscalPending ?? 0,
      icon: Users,
      to: '/pendencias-fiscais',
    },
    {
      label: 'Minhas requisições em rascunho/rejeitadas',
      count: data?.myDraftRequisitions ?? 0,
      icon: FileText,
      to: '/requisicoes?status=DRAFT',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Minhas ações pendentes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}
        {!isLoading &&
          items.map((it) => (
            <Link
              key={it.label}
              to={it.to}
              className={`flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent ${
                it.count > 0
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border'
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                <it.icon className="size-4 text-muted-foreground" />
                {it.label}
              </span>
              <span
                className={`min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
                  it.count > 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {it.count}
              </span>
            </Link>
          ))}
      </CardContent>
    </Card>
  );
}
