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
    case 'supplier-by-cnpj': {
      // Procura no catálogo demo pelo CNPJ (cnpjCpf). Os mocks tem
      // pontuação — comparamos só os dígitos.
      const cnpj = (query.get('cnpj') ?? '').replace(/\D/g, '');
      if (!cnpj) return ok({ found: false });
      const match = state.suppliers.find(
        (s: any) =>
          (s.cnpjCpf ?? '').replace(/\D/g, '') === cnpj && !s.inativo,
      );
      return ok(match ?? { found: false });
    }
    case 'cnpj-public': {
      // Mock da consulta pública (BrasilAPI). Pra demo, devolve dados
      // sinteticos quando o CNPJ termina em 0001-XX (qualquer válido),
      // senão "não encontrado". Cobre o caminho feliz da UI sem chamar
      // o serviço externo a partir do navegador.
      const cnpj = (query.get('cnpj') ?? '').replace(/\D/g, '');
      if (cnpj.length !== 14) {
        return ok({ found: false, reason: 'CNPJ inválido.' });
      }
      // Tenta achar no mock interno também (cobre o caso comum demo).
      const match = state.suppliers.find(
        (s: any) =>
          (s.cnpjCpf ?? '').replace(/\D/g, '') === cnpj && !s.inativo,
      );
      if (match) {
        return ok({
          found: true,
          cnpj,
          razaoSocial: match.razaoSocial ?? match.nome,
          nomeFantasia: match.nome ?? null,
          situacao: 'ATIVA',
          email: match.email ?? null,
          telefone: match.telefone ?? null,
          logradouro: 'Av. Demo',
          numero: '100',
          complemento: null,
          bairro: 'Centro',
          cidade: 'São Paulo',
          uf: 'SP',
          cep: '01000-000',
          cnaePrincipal: '8121-4/00 Limpeza em prédios e em domicílios',
          dataAbertura: '2010-01-15',
        });
      }
      // CNPJ válido genérico — devolve um fornecedor sintético.
      return ok({
        found: true,
        cnpj,
        razaoSocial: 'Fornecedor Externo Demo LTDA',
        nomeFantasia: 'Fornecedor Demo',
        situacao: 'ATIVA',
        email: 'contato@fornecedor-demo.com.br',
        telefone: '(11) 3000-0000',
        logradouro: 'Rua Exemplo',
        numero: '42',
        complemento: null,
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01310-100',
        cnaePrincipal: '4711-3/02 Comércio varejista de mercadorias em geral',
        dataAbertura: '2018-03-22',
      });
    }
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
  if (action === 'my-actions') {
    // Espelha o que o backend faz no `myActions` — conta o que o usuário
    // logado precisa olhar. Em demo, Admin vê TODAS as etapas pendentes
    // (mesma regra do /approvals/pending), o que casa com o card "Aprovações
    // aguardando você" que aparece zerado quando a contagem ignora o
    // override de admin.
    const userId = getDemoSessionUserId();
    const stateAny = state as any;
    const me = stateAny.users.find((u: any) => u.id === userId);
    const isAdmin = me?.profile === 'ADMIN';
    const approvalsPending = (stateAny.approvalSteps ?? []).filter(
      (s: any) =>
        s.status === 'PENDING' &&
        (isAdmin ? true : s.assignedApproverId === userId),
    ).length;
    const fiscalPending = (stateAny.fiscalItemRequests ?? []).filter(
      (f: any) =>
        f.status === 'PENDING' &&
        (me?.team?.isFiscal || isAdmin || f.requestedById === userId),
    ).length;
    const myDraftRequisitions = (stateAny.requisitions ?? []).filter(
      (r: any) =>
        r.requesterId === userId && ['DRAFT', 'REJECTED'].includes(r.status),
    ).length;
    const myInApproval = (stateAny.requisitions ?? []).filter(
      (r: any) =>
        r.requesterId === userId &&
        ['SUBMITTED', 'IN_APPROVAL', 'REVISION'].includes(r.status),
    ).length;
    return ok({
      approvalsPending,
      paPending: 0, // PA aprovador não é mockado no demo
      fiscalPending,
      myDraftRequisitions,
      myInApproval,
    });
  }
  return null;
}
