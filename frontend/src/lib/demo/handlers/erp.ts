/**
 * Handlers de leitura do "ERP" (mockado em localStorage):
 * /integration/:code/:resource e /dashboard/*.
 */
import { getDemoSessionUserId, getDemoState } from '../state';
import { ok, type DemoResponse } from './_shared';

// PO status que contam como "finalizado" pra cálculo dos KPIs.
const FINALIZED_DEMO_PO: string[] = [
  'FULLY_RECEIVED',
  'CANCELLED',
  'INTEGRATED',
];

function dashboardOpen(state: { purchaseOrders: Array<{ status: string }> }) {
  return state.purchaseOrders.filter(
    (p) => !FINALIZED_DEMO_PO.includes(p.status),
  );
}
function dashboardOverdue(
  state: {
    purchaseOrders: Array<{ status: string; expectedDelivery?: string | null }>;
  },
) {
  const now = Date.now();
  return dashboardOpen(state).filter((p) => {
    const d = (p as { expectedDelivery?: string | null }).expectedDelivery;
    return d && new Date(d).getTime() < now;
  });
}
function sum(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

export function handleIntegration(method: string, segments: string[], query: URLSearchParams): DemoResponse | null {
  if (method !== 'GET') return null;
  // /integration/:code/:resource[/:extra]
  const resource = segments[2];
  const state = getDemoState() as any;
  // scope=all retorna catálogo completo; scope=mine (default) intercala
  // com a allowlist da equipe do usuário.
  const scope = query.get('scope') ?? 'mine';
  const filterByTeam = (
    items: any[],
    table: string,
    codeField: string,
  ): any[] => {
    if (scope === 'all') return items;
    const uid = getDemoSessionUserId();
    const user = state.users.find((u: any) => u.id === uid);
    if (!user?.teamId) return items;
    const allowed = (state[table] ?? [])
      .filter((r: any) => r.teamId === user.teamId)
      .map((r: any) => r[codeField]);
    if (allowed.length === 0) return [];
    return items.filter((it: any) => allowed.includes(it.codigo));
  };
  switch (resource) {
    case 'branches':
      return ok(state.branches);
    case 'suppliers':
      return ok(state.suppliers);
    case 'items':
      return ok(state.items);
    case 'accounts':
      return ok(state.accounts);
    case 'payment-conditions':
      return ok(state.paymentConditions);
    case 'branch-rateios':
      return ok(
        filterByTeam(
          state.branchRateios,
          'teamBranchRateios',
          'branchRateioCode',
        ),
      );
    case 'cc-rateios':
      return ok(
        filterByTeam(
          state.ccRateios,
          'teamCcRateios',
          'costCenterRateioCode',
        ),
      );
    case 'compras-tipos':
      return ok(state.comprasTipos);
    case 'ctb-tipo-operacao':
      return ok(state.ctbTipoOperacao);
    case 'naturezas-entrada':
      return ok(state.naturezasEntrada);
    default:
      return ok([]);
  }
}
export function handleDashboard(
  method: string,
  segments: string[],
  _query: URLSearchParams,
): DemoResponse | null {
  if (method !== 'GET') return null;
  const state = getDemoState();
  const action = segments[1];

  if (!action) {
    const open = dashboardOpen(state);
    const overdue = dashboardOverdue(state);
    const openAmount = sum(open, 'totalAmount');
    const overdueAmount = sum(overdue, 'totalAmount');
    return ok({
      openOrders: { count: open.length, totalAmount: openAmount },
      overdueOrders: {
        count: overdue.length,
        totalAmount: overdueAmount,
        pctOfOpenVolume:
          openAmount > 0 ? Number(((overdueAmount / openAmount) * 100).toFixed(2)) : 0,
      },
      budgetConsumption: {
        budgeted: 0,
        committed: 0,
        consumed: 0,
        pctConsumed: 0,
      },
    });
  }
  if (action === 'open-orders') {
    return ok(dashboardOpen(state));
  }
  if (action === 'overdue-orders') {
    return ok(dashboardOverdue(state));
  }
  if (action === 'budget-consumption') {
    const now = new Date();
    return ok({
      period: { year: now.getFullYear(), month: now.getMonth() + 1 },
      totals: { budgeted: 0, committed: 0, consumed: 0, pctConsumed: 0 },
      byCostCenter: [],
    });
  }
  return null;
}
