/**
 * Handlers do modo demo — recebem (method, url, params, data) e devolvem
 * uma resposta simulada. Tudo lê/escreve no localStorage via state.ts.
 *
 * Cobertura suficiente para navegar o MVP:
 *   - /auth/me
 *   - /companies
 *   - /integration/:code/<resource>
 *   - /requisitions   (GET list, GET :id, POST, PATCH, POST submit,
 *                       PATCH fiscal-classify, DELETE)
 *   - /approvals/pending, POST /approvals/:id/decide
 *   - /purchase-orders (GET list, GET :id, POST, send-to-supplier, resend)
 *   - /fund-requests (GET list, GET :id)
 *   - /fiscal-item-requests (GET list, POST)
 *
 * Qualquer rota não mapeada devolve 200 com `[]` ou `null` (silencioso —
 * a UI não quebra).
 */
import { findDemoUser } from './catalog';
import {
  getDemoSessionUserId,
  getDemoState,
  mutateDemoState,
  setDemoSessionUserId,
} from './state';

type Json = Record<string, unknown> | unknown[] | null | undefined | string | number | boolean;

export interface DemoResponse {
  // `unknown` em vez de Json para suportar Blob (download de anexo demo).
  status: number;
  data: Json | Blob;
}

function ok(data: Json): DemoResponse {
  return { status: 200, data };
}
function notFound(message = 'Recurso não encontrado (demo).'): DemoResponse {
  return { status: 404, data: { statusCode: 404, message } };
}
function badRequest(message: string): DemoResponse {
  return { status: 400, data: { statusCode: 400, message } };
}
function unauthorized(message = 'Sessão demo inválida.'): DemoResponse {
  return { status: 401, data: { statusCode: 401, message } };
}

function uid(prefix = ''): string {
  const u =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}-${u}` : u;
}

function todayIso(): string {
  return new Date().toISOString();
}

/** Próximo nº sequencial para um prefixo (REQ/OC/SV/REC). */
function nextNumber(prefix: string): string {
  const state = getDemoState();
  const list = [
    ...state.requisitions.map((r) => r.number),
    ...state.purchaseOrders.map((p) => p.number),
    ...state.fundRequests.map((f) => f.number),
    ...((state as any).receivings ?? []).map((r: any) => r.number),
  ];
  const filtered = list.filter((n) => n.startsWith(`${prefix}-DEMO-`));
  const max = filtered.reduce((acc, n) => {
    const m = n.match(/(\d{6})$/);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefix}-DEMO-${String(max + 1).padStart(6, '0')}`;
}

/** Tenta extrair query string da URL. */
function parseUrl(rawUrl: string): { path: string; segments: string[]; query: URLSearchParams } {
  // remove baseURL se vier
  const url = rawUrl.replace(/^\/api(-hml)?/, '');
  const [path, qs = ''] = url.split('?');
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return {
    path: trimmed,
    segments: trimmed.split('/'),
    query: new URLSearchParams(qs),
  };
}

// ───────────────────────────────────────────────────────────────
// AUTH
// ───────────────────────────────────────────────────────────────

function handleAuth(method: string, segments: string[], data?: any): DemoResponse | null {
  const sub = segments[1]; // 'auth' + sub
  if (sub === 'me' && method === 'GET') {
    const userId = getDemoSessionUserId();
    if (!userId) return unauthorized();
    const state = getDemoState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) return unauthorized();
    return ok({
      id: user.id,
      adUsername: user.adUsername,
      email: user.email,
      name: user.name,
      profile: user.profile,
      status: user.status,
      teamId: user.teamId,
      companyIds: user.companyIds,
    });
  }
  if (sub === 'logout' && method === 'POST') {
    setDemoSessionUserId(null);
    return ok({ ok: true });
  }
  if (sub === 'demo-login' && method === 'POST') {
    const username = (data?.username ?? '').toLowerCase();
    const demo = findDemoUser(username);
    if (!demo) return badRequest(`Usuário demo "${username}" não existe.`);
    const state = getDemoState();
    const user = state.users.find((u) => u.adUsername === username);
    if (!user) return notFound('Usuário demo não inicializado.');
    setDemoSessionUserId(user.id);
    return ok({ accessToken: `demo.${user.id}`, refreshToken: `demo-refresh.${user.id}` });
  }
  if (sub === 'demo-users' && method === 'GET') {
    // Lista vinda do catálogo — usada se o front quiser ler do servidor.
    const state = getDemoState();
    return ok({
      enabled: true,
      users: state.users.map((u) => ({
        username: u.adUsername,
        name: u.name,
        profile: u.profile,
        description: '',
      })),
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// COMPANIES
// ───────────────────────────────────────────────────────────────

function handleCompanies(
  method: string,
  segments: string[],
  data?: any,
): DemoResponse | null {
  // /companies (lista)
  if (method === 'GET' && segments.length === 1) {
    return ok(getDemoState().companies);
  }
  // /companies/:id/erp-config
  const id = segments[1];
  if (segments[2] === 'erp-config') {
    const state = getDemoState();
    const company = state.companies.find((c: any) => c.id === id);
    if (!company) return notFound();
    if (method === 'GET') {
      const cfg = company.erpConfig ?? null;
      return ok({
        companyId: company.id,
        companyCode: company.code,
        companyName: company.name,
        config: cfg
          ? { ...cfg, hasSmtpPassword: !!cfg.smtpPassword, smtpPassword: undefined }
          : null,
      });
    }
    if (method === 'PUT') {
      return mutateDemoState((s) => {
        const c = s.companies.find((x: any) => x.id === id);
        if (!c) return notFound();
        const cur = c.erpConfig ?? {};
        const next = { ...cur, ...data };
        // Senha em branco/undefined preserva atual
        if (data?.smtpPassword === undefined) next.smtpPassword = cur.smtpPassword;
        c.erpConfig = next;
        return ok({ ...next, hasSmtpPassword: !!next.smtpPassword, smtpPassword: undefined });
      });
    }
  }
  return null;
}

// /settings — list + update por chave
function handleSettings(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const companyId = query.get('companyId') ?? data?.companyId;
  if (method === 'GET') {
    const defs: any[] = [
      {
        key: 'requisitions.min_quotations_threshold_amount',
        label: 'Valor mínimo para exigir cotações',
        description: 'A partir deste total, a requisição exige número mínimo de cotações.',
        type: 'number',
        value: '10000',
        isDefault: true,
        updatedAt: null,
      },
      {
        key: 'requisitions.min_quotations_required',
        label: 'Cotações mínimas obrigatórias',
        description: 'Quantidade mínima de cotações exigida quando o valor atinge o limite.',
        type: 'number',
        value: '3',
        isDefault: true,
        updatedAt: null,
      },
      {
        key: 'receiving.divergence_tolerance_pct',
        label: 'Tolerância de divergência no recebimento',
        description: 'Percentual aceito antes de marcar o recebimento como divergente.',
        type: 'number',
        value: '2',
        isDefault: true,
        updatedAt: null,
      },
    ];
    const state = getDemoState();
    const overrides = (state as any).systemSettings?.[companyId ?? ''] ?? {};
    const merged = defs.map((d) =>
      overrides[d.key] != null
        ? { ...d, value: overrides[d.key], isDefault: false, updatedAt: new Date().toISOString() }
        : d,
    );
    return ok(merged);
  }
  if (method === 'PUT') {
    const key = segments[1];
    return mutateDemoState((s: any) => {
      s.systemSettings = s.systemSettings ?? {};
      s.systemSettings[companyId] = s.systemSettings[companyId] ?? {};
      s.systemSettings[companyId][key] = String(data?.value ?? '');
      return ok({ key, value: s.systemSettings[companyId][key] });
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// INTEGRATION (dados de referência "ERP")
// ───────────────────────────────────────────────────────────────

function handleIntegration(method: string, segments: string[], _query: URLSearchParams): DemoResponse | null {
  if (method !== 'GET') return null;
  // /integration/:code/:resource[/:extra]
  const resource = segments[2];
  const state = getDemoState();
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
      return ok(state.branchRateios);
    case 'cc-rateios':
      return ok(state.ccRateios);
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

// ───────────────────────────────────────────────────────────────
// REQUISITIONS
// ───────────────────────────────────────────────────────────────

function paginate<T>(list: T[], query: URLSearchParams): { data: T[]; total: number; skip: number; take: number } {
  const skip = Number(query.get('skip') ?? 0);
  const take = Number(query.get('take') ?? 50);
  return { data: list.slice(skip, skip + take), total: list.length, skip, take };
}

function filterByQuery<T extends Record<string, any>>(list: T[], query: URLSearchParams, searchFields: string[]): T[] {
  const status = query.get('status');
  const search = query.get('search');
  const mine = query.get('mine') === 'true';
  const userId = getDemoSessionUserId();
  return list.filter((r) => {
    if (status && r.status !== status) return false;
    if (mine && r.requesterId !== userId && r.buyerId !== userId) return false;
    if (search) {
      const s = search.toLowerCase();
      const hit = searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(s));
      if (!hit) return false;
    }
    return true;
  });
}

function handleRequisitions(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
  // /requisitions[/:id[/submit|fiscal-classify]]
  const id = segments[1];
  const action = segments[2];
  const state = getDemoState();

  if (method === 'GET' && !id) {
    const filtered = filterByQuery(state.requisitions, query, ['number', 'title']);
    return ok(paginate(filtered, query));
  }
  if (method === 'GET' && id && !action) {
    const r = state.requisitions.find((x) => x.id === id);
    return r ? ok(r) : notFound();
  }
  if (method === 'POST' && !id) {
    return mutateDemoState((s) => {
      const userId = getDemoSessionUserId();
      const user = s.users.find((u) => u.id === userId);
      if (!user) return unauthorized();
      const supplier = s.suppliers.find((x) => x.codigo === data.supplierErpCode);
      const branch = s.branches.find((x) => x.codigo === data.branchErpCode);
      const cond = s.paymentConditions.find((x) => x.codigo === data.paymentConditionCode);
      if (!supplier) return badRequest(`Fornecedor inválido: ${data.supplierErpCode}`);
      if (!branch) return badRequest(`Filial inválida: ${data.branchErpCode}`);

      const itemsBuilt = (data.items ?? []).map((it: any) => {
        const total = Number(it.quantity) * Number(it.estimatedPrice);
        return {
          id: uid('rit'),
          itemErpCode: it.itemErpCode ?? null,
          itemDescription: it.itemDescription,
          quantity: String(it.quantity),
          unit: it.unit,
          estimatedPrice: String(it.estimatedPrice),
          totalPrice: total.toFixed(2),
          accountingAccount: it.accountingAccount,
          accountName: s.accounts.find((a) => a.codigo === it.accountingAccount)?.nome ?? null,
          branchRateioCode: it.branchRateioCode,
          branchRateioDesc:
            s.branchRateios.find((r) => r.codigo === it.branchRateioCode)?.descricao ?? null,
          costCenterRateioCode: it.costCenterRateioCode,
          costCenterRateioDesc:
            s.ccRateios.find((r) => r.codigo === it.costCenterRateioCode)?.descricao ?? null,
          notes: it.notes ?? null,
        };
      });
      const totalAmount = itemsBuilt.reduce((acc: number, x: any) => acc + Number(x.totalPrice), 0);
      const newReq = {
        id: uid('req'),
        number: nextNumber('REQ'),
        companyId: data.companyId,
        branchErpCode: data.branchErpCode,
        branchName: branch.nome,
        supplierErpCode: data.supplierErpCode,
        supplierName: supplier.nome,
        requesterId: user.id,
        teamId: user.teamId,
        title: data.title,
        justification: data.justification,
        tipoNotaFiscal: data.tipoNotaFiscal,
        status: 'DRAFT',
        totalAmount: totalAmount.toFixed(2),
        paymentConditionCode: data.paymentConditionCode,
        paymentConditionDesc: cond?.descricao ?? null,
        recurring: data.recurring ?? false,
        recurrenceMonths: data.recurring ? data.recurrenceMonths ?? null : null,
        contractRef: data.contractRef ?? null,
        quotationsCount: data.quotationsCount ?? 0,
        tipoCompra: data.tipoCompra ?? null,
        ctbTipoOperacao: null,
        naturezaEntrada: null,
        currentTierLevel: null,
        submittedAt: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: todayIso(),
        updatedAt: todayIso(),
        requester: { id: user.id, name: user.name },
        items: itemsBuilt,
        approvalSteps: [],
      };
      s.requisitions.push(newReq);
      return ok(newReq);
    });
  }
  if (method === 'PATCH' && id && !action) {
    return mutateDemoState((s) => {
      const idx = s.requisitions.findIndex((x) => x.id === id);
      if (idx < 0) return notFound();
      Object.assign(s.requisitions[idx], data, { updatedAt: todayIso() });
      return ok(s.requisitions[idx]);
    });
  }
  if (method === 'PATCH' && id && action === 'fiscal-classify') {
    return mutateDemoState((s) => {
      const idx = s.requisitions.findIndex((x) => x.id === id);
      if (idx < 0) return notFound();
      s.requisitions[idx].ctbTipoOperacao = data.ctbTipoOperacao;
      s.requisitions[idx].naturezaEntrada = data.naturezaEntrada;
      if (data.tipoCompra) s.requisitions[idx].tipoCompra = data.tipoCompra;
      s.requisitions[idx].updatedAt = todayIso();
      return ok(s.requisitions[idx]);
    });
  }
  if (method === 'POST' && id && action === 'submit') {
    return mutateDemoState((s) => {
      const req = s.requisitions.find((x) => x.id === id);
      if (!req) return notFound();
      if (req.status !== 'DRAFT') {
        return badRequest('Apenas requisições em rascunho podem ser submetidas.');
      }
      // Regra de cotações simulada — threshold 10k / mínimo 3.
      const threshold = 10000;
      const minRequired = 3;
      if (Number(req.totalAmount) >= threshold && (req.quotationsCount ?? 0) < minRequired) {
        return badRequest(
          `Requisição de R$ ${Number(req.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} exige no mínimo ${minRequired} cotações (anexadas: ${req.quotationsCount ?? 0}).`,
        );
      }
      // Gera steps da cadeia até o nível que cobre o valor.
      const levels = s.approvalLevels
        .filter((l) => l.teamId === req.teamId)
        .sort((a, b) => a.level - b.level);
      const amount = Number(req.totalAmount);
      const needed: any[] = [];
      for (const lvl of levels) {
        needed.push(lvl);
        const max = lvl.maxAmount === null ? null : Number(lvl.maxAmount);
        if (max === null || max >= amount) break;
      }
      // Remove steps anteriores e cria os novos.
      s.approvalSteps = s.approvalSteps.filter((st) => st.requisitionId !== req.id);
      const newSteps = needed.map((lvl) => ({
        id: uid('step'),
        companyId: req.companyId,
        entityType: 'REQUISITION',
        requisitionId: req.id,
        purchaseOrderId: null,
        fundRequestId: null,
        teamApprovalLevelId: lvl.id,
        level: lvl.level,
        levelName: lvl.name,
        assignedApproverId: lvl.approverId,
        decidedById: null,
        status: 'PENDING',
        decidedAt: null,
        comments: null,
        createdAt: todayIso(),
        updatedAt: todayIso(),
        requisition: {
          id: req.id,
          number: req.number,
          title: req.title,
          totalAmount: req.totalAmount,
          requester: { name: req.requester?.name ?? '' },
        },
      }));
      s.approvalSteps.push(...newSteps);
      req.status = needed.length === 0 ? 'APPROVED' : 'IN_APPROVAL';
      req.submittedAt = todayIso();
      req.currentTierLevel = needed[0]?.level ?? null;
      if (needed.length === 0) req.approvedAt = todayIso();
      return ok(req);
    });
  }
  if (method === 'DELETE' && id) {
    return mutateDemoState((s) => {
      const idx = s.requisitions.findIndex((x) => x.id === id);
      if (idx < 0) return notFound();
      if (s.requisitions[idx].status !== 'DRAFT') {
        return badRequest('Só rascunhos podem ser excluídos.');
      }
      s.requisitions.splice(idx, 1);
      return ok({ ok: true });
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// APPROVALS
// ───────────────────────────────────────────────────────────────

function handleApprovals(method: string, segments: string[], data?: any): DemoResponse | null {
  const sub = segments[1];
  if (method === 'GET' && sub === 'pending') {
    const userId = getDemoSessionUserId();
    const state = getDemoState();
    const steps = state.approvalSteps.filter(
      (st) => st.status === 'PENDING' && st.assignedApproverId === userId,
    );
    // Mantém só os "ativos" — sem nível anterior pendente do mesmo documento.
    const active = steps.filter((st) => {
      const lower = state.approvalSteps.filter(
        (s2) =>
          s2.requisitionId === st.requisitionId &&
          s2.level < st.level &&
          s2.status === 'PENDING',
      );
      return lower.length === 0;
    });
    return ok(active);
  }
  if (method === 'POST' && sub && segments[2] === 'decide') {
    const stepId = sub;
    return mutateDemoState((s) => {
      const step = s.approvalSteps.find((x) => x.id === stepId);
      if (!step) return notFound();
      const userId = getDemoSessionUserId();
      if (step.assignedApproverId !== userId) {
        return { status: 403, data: { message: 'Você não é o aprovador desta etapa.' } };
      }
      const req = s.requisitions.find((x) => x.id === step.requisitionId);
      if (req && req.requesterId === userId) {
        return { status: 403, data: { message: 'Você não pode aprovar a própria requisição (RN-ALC-03).' } };
      }
      step.status = data.approved ? 'APPROVED' : 'REJECTED';
      step.decidedById = userId;
      step.decidedAt = todayIso();
      step.comments = data.comments ?? null;
      if (!data.approved) {
        if (req) {
          req.status = 'REJECTED';
          req.rejectedAt = todayIso();
          req.rejectionReason = data.comments ?? null;
        }
        return ok({ result: 'REJECTED' });
      }
      // Próximo nível?
      const next = s.approvalSteps.find(
        (x) =>
          x.requisitionId === step.requisitionId &&
          x.level > step.level &&
          x.status === 'PENDING',
      );
      if (next) {
        if (req) req.currentTierLevel = next.level;
        return ok({ result: 'PENDING', nextLevel: next.level });
      }
      if (req) {
        req.status = 'APPROVED';
        req.approvedAt = todayIso();
      }
      return ok({ result: 'APPROVED' });
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ───────────────────────────────────────────────────────────────

function handlePurchaseOrders(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
  const id = segments[1];
  const action = segments[2];
  const state = getDemoState();

  if (method === 'GET' && !id) {
    const filtered = filterByQuery(state.purchaseOrders, query, ['number', 'supplierName']);
    return ok(paginate(filtered, query));
  }
  if (method === 'GET' && id && !action) {
    const po = state.purchaseOrders.find((p) => p.id === id);
    return po ? ok(po) : notFound();
  }
  if (method === 'POST' && !id) {
    // Convert requisition → PO
    return mutateDemoState((s) => {
      const req = s.requisitions.find((r) => r.id === data.requisitionId);
      if (!req) return notFound('Requisição não encontrada (demo).');
      if (req.status !== 'APPROVED') {
        return badRequest('Só requisições aprovadas viram PC.');
      }
      const userId = getDemoSessionUserId();
      const buyer = s.users.find((u) => u.id === userId);
      const priceMap = new Map<string, number>(
        (data.items ?? []).map((i: any) => [i.requisitionItemId, Number(i.unitPrice)]),
      );
      const poItems = req.items.map((it: any) => {
        const unitPrice = priceMap.get(it.id) ?? Number(it.estimatedPrice);
        const total = Number(it.quantity) * unitPrice;
        return {
          id: uid('poit'),
          requisitionItemId: it.id,
          itemErpCode: it.itemErpCode,
          itemDescription: it.itemDescription,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: unitPrice.toFixed(2),
          totalPrice: total.toFixed(2),
          accountingAccount: it.accountingAccount,
          accountName: it.accountName,
          branchRateioCode: it.branchRateioCode,
          branchRateioDesc: it.branchRateioDesc,
          costCenterRateioCode: it.costCenterRateioCode,
          costCenterRateioDesc: it.costCenterRateioDesc,
          receivedQty: '0',
          notes: it.notes,
          rateios: [],
        };
      });
      const totalAmount = poItems.reduce((acc: number, x: any) => acc + Number(x.totalPrice), 0);
      const po: any = {
        id: uid('po'),
        number: nextNumber('OC'),
        requisitionId: req.id,
        companyId: req.companyId,
        branchErpCode: req.branchErpCode,
        branchName: req.branchName,
        supplierErpCode: req.supplierErpCode,
        supplierName: req.supplierName,
        buyerId: buyer?.id ?? null,
        status: 'APPROVED',
        paymentCondition: data.paymentCondition ?? req.paymentConditionDesc ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        expectedDelivery: data.expectedDelivery ?? null,
        totalAmount: totalAmount.toFixed(2),
        notes: null,
        currentTierLevel: null,
        erpPedido: null,
        erpStagingId: null,
        integratedAt: null,
        submittedAt: todayIso(),
        approvedAt: todayIso(),
        sentToSupplierAt: null,
        cancelledAt: null,
        cancellationReason: null,
        createdAt: todayIso(),
        updatedAt: todayIso(),
        items: poItems,
        buyer: buyer ? { id: buyer.id, name: buyer.name } : undefined,
        receivings: [],
        fundRequest: null,
      };
      s.purchaseOrders.push(po);
      req.status = 'CONVERTED';
      req.updatedAt = todayIso();
      // SV simulada quando NF_FUTURA
      if (req.tipoNotaFiscal === 'NF_FUTURA') {
        const sv: any = {
          id: uid('sv'),
          number: nextNumber('SV'),
          companyId: req.companyId,
          requisitionId: req.id,
          purchaseOrderId: po.id,
          requesterId: buyer?.id ?? null,
          title: req.title,
          status: 'APPROVED',
          totalAmount: po.totalAmount,
          currentTierLevel: null,
          erpSolicitacao: null,
          erpStagingId: null,
          integratedAt: null,
          submittedAt: todayIso(),
          approvedAt: todayIso(),
          rejectedAt: null,
          rejectionReason: null,
          createdAt: todayIso(),
          updatedAt: todayIso(),
          items: [],
        };
        s.fundRequests.push(sv);
        po.fundRequest = sv;
      }
      return ok(po);
    });
  }
  if (method === 'POST' && id && action === 'send-to-supplier') {
    return mutateDemoState((s) => {
      const po = s.purchaseOrders.find((p) => p.id === id);
      if (!po) return notFound();
      if (po.status !== 'APPROVED') {
        return badRequest('Só PCs aprovados podem ser enviados.');
      }
      po.status = 'SENT_TO_SUPPLIER';
      po.sentToSupplierAt = todayIso();
      po.integratedAt = todayIso();
      po.erpPedido = `DEMO${Date.now().toString().slice(-5)}`;
      po.updatedAt = todayIso();
      const recipient = data?.recipientEmail ?? null;
      // Loga "integração" no demo
      s.integrationLogs.push({
        id: uid('log'),
        companyId: po.companyId,
        source: 'ERP_DEMO',
        jobType: 'SEND_PO',
        status: 'SUCCESS',
        recordsProcessed: 1 + (po.items?.length ?? 0),
        durationMs: 250,
        errorDetails: null,
        executedAt: todayIso(),
      });
      return ok({ ...po, emailSent: !!recipient && !data?.skipEmail, emailRecipient: recipient });
    });
  }
  if (method === 'POST' && id && action === 'resend') {
    return ok({ ok: true, recipient: data?.recipientEmail ?? null });
  }
  if (method === 'POST' && id && action === 'cancel') {
    const reason = String(data?.cancellationReason ?? '').trim();
    if (reason.length < 10) {
      return badRequest('O motivo deve ter ao menos 10 caracteres.');
    }
    return mutateDemoState((s) => {
      const po = s.purchaseOrders.find((p: any) => p.id === id);
      if (!po) return notFound();
      if (po.status === 'CANCELLED') {
        return badRequest('Pedido já está cancelado.');
      }
      if (po.status === 'FULLY_RECEIVED') {
        return badRequest('Pedido totalmente recebido — não pode ser cancelado, apenas estornado.');
      }
      const anyReceived = (po.items ?? []).some(
        (it: any) => Number(it.receivedQty) > 0,
      );
      if (anyReceived) {
        return badRequest(
          'Já há itens recebidos. Cancelamento de itens individuais ainda não está disponível.',
        );
      }
      po.status = 'CANCELLED';
      po.cancelledAt = todayIso();
      po.cancellationReason = reason;
      po.updatedAt = todayIso();
      return ok(po);
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// FUND REQUESTS
// ───────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────
// USERS — CRUD admin
// ───────────────────────────────────────────────────────────────

function handleUsers(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  const id = segments[1];
  const action = segments[2];
  // GET /users — lista com filtros
  if (method === 'GET' && !id) {
    const statusFilter = query.get('status');
    const search = query.get('search')?.toLowerCase();
    let rows = state.users as any[];
    if (statusFilter) rows = rows.filter((u) => u.status === statusFilter);
    if (search) {
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          u.adUsername.toLowerCase().includes(search),
      );
    }
    return ok(paginate(rows, query));
  }
  if (method === 'GET' && id && !action) {
    const u = state.users.find((x: any) => x.id === id);
    return u ? ok(u) : notFound();
  }
  if (method === 'PATCH' && id && !action) {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      if (data?.name !== undefined) u.name = data.name;
      if (data?.profile !== undefined) u.profile = data.profile;
      if (data?.status !== undefined) u.status = data.status;
      if (data?.teamId !== undefined) u.teamId = data.teamId;
      u.updatedAt = todayIso();
      return ok(u);
    });
  }
  if (method === 'PUT' && id && action === 'companies') {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      u.companyIds = data?.companyIds ?? [];
      u.companies = (data?.companyIds ?? []).map((cid: string) => ({
        companyId: cid,
      }));
      u.updatedAt = todayIso();
      return ok(u);
    });
  }
  if (method === 'DELETE' && id && !action) {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      u.status = 'INACTIVE';
      u.deletedAt = todayIso();
      return ok(u);
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// TEAMS — CRUD admin + cadeia de aprovação
// ───────────────────────────────────────────────────────────────

function handleTeams(
  method: string,
  segments: string[],
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  const id = segments[1];
  const action = segments[2];
  // Inicializa array de teams se ainda só existir o objeto único `team`.
  state.teamsList = state.teamsList ?? (state.team ? [state.team] : []);

  if (method === 'GET' && !id) {
    return ok(
      state.teamsList.map((t: any) => ({
        ...t,
        approvalLevels: (state.approvalLevels ?? []).filter(
          (l: any) => l.teamId === t.id,
        ),
      })),
    );
  }
  if (method === 'GET' && id && !action) {
    const t = state.teamsList.find((x: any) => x.id === id);
    if (!t) return notFound();
    return ok({
      ...t,
      approvalLevels: (state.approvalLevels ?? [])
        .filter((l: any) => l.teamId === id)
        .map((l: any) => {
          const approver = state.users.find((u: any) => u.id === l.approverId);
          return { ...l, approver: approver ? { id: approver.id, name: approver.name } : null };
        }),
    });
  }
  if (method === 'POST' && !id) {
    return mutateDemoState((s: any) => {
      const t = {
        id: uid('team'),
        name: String(data?.name ?? '').trim(),
        managerId: null,
        isFiscal: false,
        active: true,
        createdAt: todayIso(),
        updatedAt: todayIso(),
      };
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      s.teamsList.push(t);
      return ok(t);
    });
  }
  if (method === 'PATCH' && id && !action) {
    return mutateDemoState((s: any) => {
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      const t = s.teamsList.find((x: any) => x.id === id);
      if (!t) return notFound();
      if (data?.name !== undefined) t.name = data.name;
      if (data?.active !== undefined) t.active = data.active;
      t.updatedAt = todayIso();
      return ok(t);
    });
  }
  if (method === 'DELETE' && id && !action) {
    return mutateDemoState((s: any) => {
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      const t = s.teamsList.find((x: any) => x.id === id);
      if (!t) return notFound();
      t.active = false;
      t.updatedAt = todayIso();
      return ok(t);
    });
  }
  if (method === 'PUT' && id && action === 'approval-levels') {
    return mutateDemoState((s: any) => {
      s.approvalLevels = (s.approvalLevels ?? []).filter(
        (l: any) => l.teamId !== id,
      );
      for (const l of data?.levels ?? []) {
        s.approvalLevels.push({
          id: uid('lvl'),
          teamId: id,
          level: l.level,
          name: l.name,
          approverId: l.approverId,
          maxAmount: l.maxAmount != null ? String(l.maxAmount) : null,
        });
      }
      const t = (s.teamsList ?? []).find((x: any) => x.id === id) ?? s.team;
      return ok(t ?? { id });
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// DELEGATIONS — concedidas/recebidas
// ───────────────────────────────────────────────────────────────

function handleDelegations(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  state.delegations = state.delegations ?? [];
  const id = segments[1];
  const userId = getDemoSessionUserId();
  if (method === 'GET' && !id) {
    const type = query.get('type') === 'received' ? 'received' : 'given';
    const rows = (state.delegations as any[]).filter((d) =>
      type === 'given' ? d.delegatorId === userId : d.delegateId === userId,
    );
    // Enrichment com nomes
    const enriched = rows.map((d) => ({
      ...d,
      delegator: {
        id: d.delegatorId,
        name: state.users.find((u: any) => u.id === d.delegatorId)?.name,
      },
      delegate: {
        id: d.delegateId,
        name: state.users.find((u: any) => u.id === d.delegateId)?.name,
      },
    }));
    return ok(enriched);
  }
  if (method === 'POST' && !id) {
    return mutateDemoState((s: any) => {
      s.delegations = s.delegations ?? [];
      if (data?.delegateId === userId) {
        return badRequest('Você não pode delegar para si mesmo.');
      }
      if (new Date(data?.endsAt) <= new Date(data?.startsAt)) {
        return badRequest('Fim deve ser após o início.');
      }
      const d = {
        id: uid('del'),
        delegatorId: userId,
        delegateId: data.delegateId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        reason: data.reason ?? null,
        cancelledAt: null,
        createdAt: todayIso(),
      };
      s.delegations.push(d);
      return ok(d);
    });
  }
  if (method === 'DELETE' && id) {
    return mutateDemoState((s: any) => {
      s.delegations = s.delegations ?? [];
      const d = s.delegations.find((x: any) => x.id === id);
      if (!d) return notFound();
      if (d.delegatorId !== userId) {
        return badRequest('Só o autor da delegação pode cancelar.');
      }
      d.cancelledAt = todayIso();
      return ok(d);
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// PEDIDOS DE PRODUTO ACABADO (PA) — leitura simulada do "ERP"
// ───────────────────────────────────────────────────────────────

function handleProductOrdersPa(
  method: string,
  segments: string[],
  query: URLSearchParams,
): DemoResponse | null {
  if (method !== 'GET') return null;
  const state = getDemoState() as any;
  // /product-orders-pa/:company/:pedido?/grade?
  const pedido = segments[2];
  const sub = segments[3];

  if (!pedido) {
    let rows = (state.paOrders ?? []) as any[];
    const status = query.get('status');
    if (status && status !== 'ALL') {
      rows = rows.filter((r) => (r.status_compra ?? '').trim() === status);
    }
    const search = query.get('search')?.toLowerCase();
    if (search) {
      rows = rows.filter(
        (r) =>
          r.pedido.toLowerCase().includes(search) ||
          (r.fornecedor ?? '').toLowerCase().includes(search),
      );
    }
    rows = rows
      .slice()
      .sort((a, b) => (a.emissao < b.emissao ? 1 : -1));
    return ok(rows);
  }
  if (pedido && sub === 'grade') {
    const produto = query.get('produto');
    const cor = query.get('cor');
    const entrega = query.get('entrega');
    const rows = ((state.paGrade ?? []) as any[]).filter(
      (g) =>
        g.pedido === pedido &&
        g.produto === produto &&
        g.cor === cor &&
        (!entrega || g.entrega === entrega),
    );
    const grade = rows[0]?.grade ?? null;
    const tamanhos: Record<number, string> = {};
    for (const t of (state.paTamanhos ?? []) as any[]) {
      if (t.grade === grade) tamanhos[t.posicao] = t.tamanho;
    }
    return ok({
      grade,
      rows: rows.map((r) => ({
        posicao: r.posicao,
        qtdeOriginal: r.qtde_original,
        qtdeEntregue: r.qtde_entregue,
        tamanho: tamanhos[r.posicao] ?? null,
      })),
    });
  }
  if (pedido && !sub) {
    const header = ((state.paOrders ?? []) as any[]).find(
      (r) => r.pedido === pedido,
    );
    if (!header) return notFound();
    const items = ((state.paItems ?? []) as any[]).filter(
      (i) => i.pedido === pedido,
    );
    return ok({ ...header, items });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// ATTACHMENTS — modo demo simula sem armazenar bytes reais
// ───────────────────────────────────────────────────────────────

function handleAttachments(
  method: string,
  segments: string[],
  _query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  state.attachments = state.attachments ?? [];
  // /attachments/:kind/:parentId  (GET = list, POST = upload)
  if (segments.length === 3 && (method === 'GET' || method === 'POST')) {
    const [, kind, parentId] = segments;
    const field =
      kind === 'requisition'
        ? 'requisitionId'
        : kind === 'purchaseOrder'
          ? 'purchaseOrderId'
          : kind === 'receiving'
            ? 'receivingId'
            : kind === 'fundRequest'
              ? 'fundRequestId'
              : null;
    if (!field) return badRequest('Tipo de anexo inválido.');
    if (method === 'GET') {
      return ok(
        state.attachments
          .filter((a: any) => a[field] === parentId)
          .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1)),
      );
    }
    if (method === 'POST') {
      // Em demo o axios envia FormData; o adapter passa o objeto direto.
      // Pegamos só o nome do arquivo como mock.
      const userId = getDemoSessionUserId();
      const f: File | undefined =
        (data as any)?.get?.('file') ?? (data as any)?.file;
      const fname = f?.name ?? `demo-${Date.now()}.pdf`;
      const fsize = f?.size ?? 1024;
      const fmime = f?.type ?? 'application/pdf';
      return mutateDemoState((s: any) => {
        s.attachments = s.attachments ?? [];
        const att = {
          id: uid('att'),
          [field]: parentId,
          filename: fname,
          storageKey: `demo/${parentId}/${fname}`,
          sizeBytes: fsize,
          mimeType: fmime,
          uploadedById: userId,
          createdAt: todayIso(),
        };
        s.attachments.push(att);
        return ok({
          id: att.id,
          filename: att.filename,
          sizeBytes: att.sizeBytes,
          mimeType: att.mimeType,
          createdAt: att.createdAt,
        });
      });
    }
  }
  // /attachments/:id/download
  if (segments.length === 3 && segments[2] === 'download' && method === 'GET') {
    // Em demo não há arquivo real — devolve um PDF "vazio" só pra UI não quebrar.
    const id = segments[1];
    const att = state.attachments.find((a: any) => a.id === id);
    if (!att) return notFound();
    // Blob de texto curto, suficiente pra o browser oferecer download.
    const blob = new Blob(
      [`Anexo demo: ${att.filename}\n\nSem conteúdo real no modo demonstração.`],
      { type: 'text/plain' },
    );
    return { status: 200, data: blob };
  }
  // /attachments/:id  (DELETE)
  if (segments.length === 2 && method === 'DELETE') {
    const id = segments[1];
    return mutateDemoState((s: any) => {
      s.attachments = (s.attachments ?? []).filter((a: any) => a.id !== id);
      return ok({ ok: true });
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// DASHBOARD (F7) — derivado dos PCs do demo
// ───────────────────────────────────────────────────────────────

const FINALIZED_DEMO_PO: string[] = [
  'FULLY_RECEIVED',
  'CANCELLED',
  'INTEGRATED',
];

function dashboardOpen(state: any) {
  return state.purchaseOrders.filter(
    (p: any) => !FINALIZED_DEMO_PO.includes(p.status),
  );
}
function dashboardOverdue(state: any) {
  const now = Date.now();
  return dashboardOpen(state).filter(
    (p: any) => p.expectedDelivery && new Date(p.expectedDelivery).getTime() < now,
  );
}
function sum(rows: any[], key: string): number {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

function handleDashboard(
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

// ───────────────────────────────────────────────────────────────
// RECEIVING (F6)
// ───────────────────────────────────────────────────────────────

function handleReceiving(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const id = segments[1];
  const action = segments[2];
  const state = getDemoState();

  if (method === 'GET' && !id) {
    const filtered = filterByQuery(state.receivings, query, ['number']);
    return ok(paginate(filtered, query));
  }
  if (method === 'GET' && id && !action) {
    const r = state.receivings.find((x: any) => x.id === id);
    return r ? ok(r) : notFound();
  }
  if (method === 'POST' && !id) {
    // Validação fora da transação — devolver badRequest sem persistir.
    if (!data?.purchaseOrderId) {
      return badRequest('Pedido de compra não informado.');
    }
    const rawItems = (data.items ?? []) as any[];
    if (rawItems.length === 0) {
      return badRequest('Informe pelo menos um item recebido.');
    }
    const sanitized: any[] = [];
    for (const line of rawItems) {
      const accepted = Number(line.acceptedQty || 0);
      const rejected = Number(line.rejectedQty ?? 0);
      const received = Number(
        line.receivedQty != null && line.receivedQty !== 0
          ? line.receivedQty
          : accepted + rejected,
      );
      const sumOk =
        Math.abs(accepted + rejected - received) < 0.0001;
      if (!sumOk) {
        return badRequest(
          'Aceito + rejeitado deve ser igual ao recebido em todos os itens.',
        );
      }
      sanitized.push({
        purchaseOrderItemId: line.purchaseOrderItemId,
        receivedQty: received,
        acceptedQty: accepted,
        rejectedQty: rejected,
        rejectionReason: line.rejectionReason ?? null,
      });
    }
    return mutateDemoState((s) => {
      const po = s.purchaseOrders.find((p: any) => p.id === data.purchaseOrderId);
      if (!po) return notFound('Pedido de compra não encontrado (demo).');
      if (!['APPROVED', 'SENT_TO_SUPPLIER', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        return badRequest('Pedido não admite recebimento.');
      }
      const userId = getDemoSessionUserId();
      const userObj = s.users.find((u: any) => u.id === userId);
      const items = sanitized.map((line) => ({
        id: uid('recit'),
        purchaseOrderItemId: line.purchaseOrderItemId,
        receivedQty: line.receivedQty.toFixed(4),
        acceptedQty: line.acceptedQty.toFixed(4),
        rejectedQty: line.rejectedQty.toFixed(4),
        rejectionReason: line.rejectionReason ?? null,
      }));
      const rec: any = {
        id: uid('rec'),
        number: nextNumber('REC'),
        purchaseOrderId: po.id,
        companyId: po.companyId,
        receivedById: userObj?.id ?? null,
        status: 'DRAFT',
        receivedAt: data.receivedAt ?? todayIso(),
        measurementStart: data.measurementStart ?? null,
        measurementEnd: data.measurementEnd ?? null,
        completionPct: data.completionPct ?? null,
        notes: data.notes ?? null,
        divergenceNotes: null,
        confirmedAt: null,
        createdAt: todayIso(),
        updatedAt: todayIso(),
        receivedBy: userObj ? { id: userObj.id, name: userObj.name } : undefined,
        purchaseOrder: { id: po.id, number: po.number, status: po.status },
        items,
      };
      s.receivings.push(rec);
      return ok(rec);
    });
  }
  if (method === 'POST' && id && action === 'confirm') {
    return mutateDemoState((s) => {
      const rec = s.receivings.find((x: any) => x.id === id);
      if (!rec) return notFound();
      if (rec.status !== 'DRAFT') {
        return badRequest('Só recebimentos em rascunho podem ser confirmados.');
      }
      const po = s.purchaseOrders.find((p: any) => p.id === rec.purchaseOrderId);
      if (!po) return notFound('Pedido associado não encontrado (demo).');

      // Acumula aceito no saldo dos itens do PC.
      for (const ri of rec.items) {
        const poItem = po.items.find((pi: any) => pi.id === ri.purchaseOrderItemId);
        if (poItem) {
          const cur = Number(poItem.receivedQty || 0);
          poItem.receivedQty = (cur + Number(ri.acceptedQty)).toFixed(4);
        }
      }
      // Recalcula status do PC.
      const fullyReceived = po.items.every(
        (it: any) => Number(it.receivedQty) - Number(it.quantity) >= -1e-6,
      );
      po.status = fullyReceived ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
      po.updatedAt = todayIso();

      // Divergência simulada quando rejeição > 0 (no demo a tolerância é zero).
      const totalReceived = rec.items.reduce(
        (a: number, it: any) => a + Number(it.receivedQty),
        0,
      );
      const totalRejected = rec.items.reduce(
        (a: number, it: any) => a + Number(it.rejectedQty),
        0,
      );
      const divergent = totalRejected > 0;
      rec.status = divergent ? 'DIVERGENT' : 'CONFIRMED';
      rec.confirmedAt = todayIso();
      rec.divergenceNotes = divergent
        ? `Rejeição de ${((totalRejected / Math.max(totalReceived, 1)) * 100).toFixed(2)}% no recebimento.`
        : null;
      rec.updatedAt = todayIso();
      return ok(rec);
    });
  }
  return null;
}

function handleFundRequests(method: string, segments: string[], query: URLSearchParams): DemoResponse | null {
  const id = segments[1];
  const state = getDemoState();
  if (method === 'GET' && !id) {
    const filtered = filterByQuery(state.fundRequests, query, ['number', 'title']);
    return ok(paginate(filtered, query));
  }
  if (method === 'GET' && id) {
    const sv = state.fundRequests.find((f) => f.id === id);
    return sv ? ok(sv) : notFound();
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// FISCAL ITEM REQUESTS
// ───────────────────────────────────────────────────────────────

function handleFiscalItemRequests(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
  const id = segments[1];
  const state = getDemoState();
  if (method === 'GET' && !id) {
    return ok({ data: state.fiscalItemRequests, total: state.fiscalItemRequests.length, ...paginate(state.fiscalItemRequests, query) });
  }
  if (method === 'POST') {
    return mutateDemoState((s) => {
      const userId = getDemoSessionUserId();
      const item = {
        id: uid('fir'),
        companyId: data.companyId,
        type: data.type,
        status: 'PENDING',
        supplierErpCode: data.supplierErpCode,
        supplierName: data.supplierName,
        itemErpCode: data.itemErpCode ?? null,
        itemDescription: data.itemDescription,
        unit: data.unit ?? null,
        requestedById: userId,
        resolvedById: null,
        resolvedAt: null,
        rejectionReason: null,
        notes: data.notes ?? null,
        createdAt: todayIso(),
        updatedAt: todayIso(),
      };
      s.fiscalItemRequests.push(item);
      return ok(item);
    });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// Roteamento principal
// ───────────────────────────────────────────────────────────────

export function routeDemoRequest(
  method: string,
  rawUrl: string,
  data?: any,
): DemoResponse {
  const m = method.toUpperCase();
  const { segments, query } = parseUrl(rawUrl);
  const root = segments[0];

  const handlers: Record<string, () => DemoResponse | null> = {
    auth: () => handleAuth(m, segments, data),
    companies: () => handleCompanies(m, segments, data),
    settings: () => handleSettings(m, segments, query, data),
    integration: () => handleIntegration(m, segments, query),
    requisitions: () => handleRequisitions(m, segments, query, data),
    approvals: () => handleApprovals(m, segments, data),
    'purchase-orders': () => handlePurchaseOrders(m, segments, query, data),
    'fund-requests': () => handleFundRequests(m, segments, query),
    receiving: () => handleReceiving(m, segments, query, data),
    dashboard: () => handleDashboard(m, segments, query),
    attachments: () => handleAttachments(m, segments, query, data),
    'product-orders-pa': () => handleProductOrdersPa(m, segments, query),
    'fiscal-item-requests': () => handleFiscalItemRequests(m, segments, query, data),
    users: () => handleUsers(m, segments, query, data),
    teams: () => handleTeams(m, segments, data),
    delegations: () => handleDelegations(m, segments, query, data),
  };

  const handler = handlers[root];
  if (handler) {
    const res = handler();
    if (res) return res;
  }

  // Rota não mapeada — devolve vazio para não quebrar UI.
  // eslint-disable-next-line no-console
  console.info(`[demo] rota não mapeada: ${m} ${rawUrl} — devolvendo []`);
  return ok([]);
}
