/**
 * Handlers do fluxo de documentos: requisições, pedidos de compra,
 * solicitações de verba, aprovações. `buildHistory` é o helper interno
 * que monta as timelines retornadas em `/<entity>/:id/history`.
 */
import {
  getDemoSessionUserId,
  getDemoState,
  mutateDemoState,
} from '../state';
import {
  badRequest,
  filterByQuery,
  nextNumber,
  notFound,
  ok,
  paginate,
  todayIso,
  uid,
  unauthorized,
  type DemoResponse,
} from './_shared';

function buildHistory(entity: 'requisition' | 'po' | 'sv', id: string) {
  const state = getDemoState();
  const events: Array<{
    at: string;
    kind: string;
    label: string;
    who?: string | null;
    detail?: string | null;
  }> = [];
  const findUser = (uid: string | null | undefined) =>
    uid ? state.users.find((u: any) => u.id === uid) : null;

  if (entity === 'requisition') {
    const r = state.requisitions.find((x: any) => x.id === id);
    if (!r) return [];
    events.push({
      at: r.createdAt,
      kind: 'created',
      label: 'Requisição criada',
      who: findUser(r.requesterId)?.name ?? null,
    });
    if (r.submittedAt)
      events.push({
        at: r.submittedAt,
        kind: 'submitted',
        label: 'Submetida para aprovação',
        who: findUser(r.requesterId)?.name ?? null,
      });
    // Última step decidida (APPROVED/REJECTED) define o "who" da
    // aprovação/rejeição final — espelha o backend.
    const decidedSteps = (state.approvalSteps ?? [])
      .filter((s: any) => s.requisitionId === id && s.decidedAt)
      .sort((a: any, b: any) => (a.decidedAt < b.decidedAt ? 1 : -1));
    const lastApproved = decidedSteps.find((s: any) => s.status === 'APPROVED');
    const lastRejected = decidedSteps.find((s: any) => s.status === 'REJECTED');
    if (r.approvedAt)
      events.push({
        at: r.approvedAt,
        kind: 'approved',
        label: 'Requisição aprovada',
        who: findUser(lastApproved?.decidedById)?.name ?? null,
      });
    if (r.rejectedAt)
      events.push({
        at: r.rejectedAt,
        kind: 'rejected',
        label: 'Requisição rejeitada',
        who: findUser(lastRejected?.decidedById)?.name ?? null,
        detail: r.rejectionReason,
      });
    const steps = (state.approvalSteps ?? []).filter(
      (s: any) =>
        s.requisitionId === id &&
        s.status !== 'PENDING' &&
        s.decidedAt,
    );
    for (const s of steps) {
      events.push({
        at: s.decidedAt,
        kind:
          s.status === 'REVISION'
            ? 'step-revision'
            : `step-${String(s.status).toLowerCase()}`,
        label:
          s.status === 'REVISION'
            ? `${s.levelName ?? 'Nível'}: devolveu para revisão`
            : `${s.levelName ?? 'Nível'}: ${
                s.status === 'APPROVED' ? 'aprovou' : 'reprovou'
              }`,
        who: findUser(s.decidedById)?.name ?? null,
        detail: s.comments,
      });
    }
  } else if (entity === 'po') {
    const p = state.purchaseOrders.find((x: any) => x.id === id);
    if (!p) return [];
    events.push({
      at: p.createdAt,
      kind: 'created',
      label: 'Pedido criado a partir da requisição',
      who: findUser(p.buyerId)?.name ?? null,
    });
    if (p.approvedAt)
      events.push({ at: p.approvedAt, kind: 'approved', label: 'Pedido aprovado' });
    if (p.sentToSupplierAt)
      events.push({
        at: p.sentToSupplierAt,
        kind: 'sent',
        label: 'Enviado ao fornecedor',
      });
    if (p.integratedAt)
      events.push({
        at: p.integratedAt,
        kind: 'integrated',
        label: `Integrado ao ERP (${p.erpPedido ?? 'sem número'})`,
      });
    if (p.cancelledAt)
      events.push({
        at: p.cancelledAt,
        kind: 'cancelled',
        label: 'Pedido cancelado',
        detail: p.cancellationReason,
      });
    const recs = (state.receivings ?? []).filter(
      (r: any) => r.purchaseOrderId === id && r.status === 'CONFIRMED',
    );
    for (const r of recs) {
      events.push({
        at: r.confirmedAt,
        kind: 'received',
        label: `Recebimento ${r.number} confirmado`,
        who: findUser(r.receivedById)?.name ?? null,
      });
    }
  } else {
    // SV
    const s = state.fundRequests.find((x: any) => x.id === id);
    if (!s) return [];
    events.push({
      at: s.createdAt,
      kind: 'created',
      label: 'Solicitação criada',
      who: findUser(s.requesterId)?.name ?? null,
    });
    if (s.submittedAt)
      events.push({ at: s.submittedAt, kind: 'submitted', label: 'Enviada para aprovação' });
    if (s.approvedAt)
      events.push({ at: s.approvedAt, kind: 'approved', label: 'Solicitação aprovada' });
    if (s.integratedAt)
      events.push({
        at: s.integratedAt,
        kind: 'integrated',
        label: `Integrada ao ERP (${s.erpSolicitacao ?? 'sem número'})`,
      });
  }
  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
export function handleRequisitions(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
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
    if (!r) return notFound();
    // Acopla approvalSteps com nomes (decidedByName / assignedApproverName)
    // — espelha o que o backend retorna no findOne.
    const findUser = (uid?: string) =>
      uid ? state.users.find((u: any) => u.id === uid) : undefined;
    const steps = (state.approvalSteps ?? [])
      .filter((s: any) => s.requisitionId === id)
      .sort((a: any, b: any) => a.level - b.level)
      .map((s: any) => ({
        id: s.id,
        level: s.level,
        levelName: s.levelName,
        status: s.status,
        decidedAt: s.decidedAt,
        decidedByName: findUser(s.decidedById)?.name ?? null,
        assignedApproverName: findUser(s.assignedApproverId)?.name ?? null,
        comments: s.comments,
      }));
    // POs gerados desta req (atalho pro detalhe).
    const pos = (state.purchaseOrders ?? [])
      .filter((p: any) => p.requisitionId === id && !p.deletedAt)
      .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p: any) => ({
        id: p.id,
        number: p.number,
        status: p.status,
        erpPedido: p.erpPedido ?? null,
      }));
    return ok({ ...r, approvalSteps: steps, purchaseOrders: pos });
  }
  if (method === 'GET' && id && action === 'history') {
    return ok(buildHistory('requisition', id));
  }
  if (id && action === 'quotations') {
    // GET /requisitions/:id/quotations | POST /requisitions/:id/quotations
    return handleRequisitionQuotations(method, id, data, state);
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
  if (method === 'POST' && id && action === 'quotation-waiver') {
    return mutateDemoState((s) => {
      const req = s.requisitions.find((x) => x.id === id) as any;
      if (!req) return notFound();
      if (req.status !== 'DRAFT' && req.status !== 'REVISION') {
        return badRequest(
          'A dispensa só pode ser solicitada em rascunho ou revisão.',
        );
      }
      const reason = String((data as any)?.reason ?? '');
      const note = String((data as any)?.note ?? '').trim();
      const valid = [
        'CONTRATO_VIGENTE',
        'RECORRENTE',
        'UNICO_FORNECEDOR',
        'EMERGENCIA',
        'OUTRO',
      ];
      if (!valid.includes(reason)) {
        return badRequest('Motivo de dispensa inválido.');
      }
      if (note.length < 20) {
        return badRequest(
          'A justificativa precisa ter no mínimo 20 caracteres.',
        );
      }
      req.quotationWaiverReason = reason;
      req.quotationWaiverNote = note;
      req.quotationWaiverAt = todayIso();
      return ok({ ok: true });
    });
  }
  if (method === 'DELETE' && id && action === 'quotation-waiver') {
    return mutateDemoState((s) => {
      const req = s.requisitions.find((x) => x.id === id) as any;
      if (!req) return notFound();
      if (req.status !== 'DRAFT' && req.status !== 'REVISION') {
        return badRequest(
          'A dispensa só pode ser removida em rascunho ou revisão.',
        );
      }
      req.quotationWaiverReason = null;
      req.quotationWaiverNote = null;
      req.quotationWaiverAt = null;
      return ok({ ok: true });
    });
  }
  if (method === 'POST' && id && action === 'clone') {
    return mutateDemoState((s) => {
      const src = s.requisitions.find((x: any) => x.id === id);
      if (!src) return notFound();
      const newId = uid();
      const stamp = new Date().toLocaleDateString('pt-BR');
      const seq = (s.requisitions.length + 1).toString().padStart(6, '0');
      const cloned = {
        ...src,
        id: newId,
        number: `REQ-${new Date().getFullYear()}-${seq}`,
        title: `${src.title} (cópia ${stamp})`,
        status: 'DRAFT',
        submittedAt: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
        recurring: false,
        quotationWaiverReason: null,
        quotationWaiverNote: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      s.requisitions.push(cloned);
      return ok({ id: newId, number: cloned.number });
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
      // Exceção: dispensa explícita pula a checagem (RN-REQ-02).
      const threshold = 10000;
      const minRequired = 3;
      const waiver = (req as any).quotationWaiverReason;
      if (!waiver) {
        const realCount = (s.attachments ?? []).filter(
          (a: any) => a.requisitionId === req.id && a.kind === 'QUOTATION',
        ).length;
        if (Number(req.totalAmount) >= threshold && realCount < minRequired) {
          return badRequest(
            `Requisição de R$ ${Number(req.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} exige no mínimo ${minRequired} cotação(ões) anexada(s) (atual: ${realCount}).`,
          );
        }
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
  if (method === 'POST' && id && action === 'resubmit') {
    return mutateDemoState((s) => {
      const req = s.requisitions.find((x) => x.id === id) as any;
      if (!req) return notFound();
      if (req.status !== 'REVISION') {
        return badRequest(
          'Só requisições em revisão podem ser re-submetidas por este caminho.',
        );
      }
      // Mesma checagem de cotações do submit.
      const threshold = 10000;
      const minRequired = 3;
      if (!req.quotationWaiverReason) {
        const realCount = (s.attachments ?? []).filter(
          (a: any) => a.requisitionId === req.id && a.kind === 'QUOTATION',
        ).length;
        if (Number(req.totalAmount) >= threshold && realCount < minRequired) {
          return badRequest(
            `Requisição de R$ ${Number(req.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} exige no mínimo ${minRequired} cotação(ões) anexada(s) (atual: ${realCount}).`,
          );
        }
      }
      // Recria a cadeia.
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
      s.approvalSteps = s.approvalSteps.filter(
        (st) => st.requisitionId !== req.id,
      );
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
      req.currentTierLevel = needed[0]?.level ?? null;
      req.revisionReason = null;
      req.revisionRequestedAt = null;
      req.revisionRequestedById = null;
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
export function handleApprovals(method: string, segments: string[], data?: any): DemoResponse | null {
  const sub = segments[1];
  if (method === 'GET' && sub === 'mine-waiting') {
    const userId = getDemoSessionUserId();
    const state = getDemoState();
    const reqs = state.requisitions.filter(
      (r: any) =>
        r.requesterId === userId &&
        ['SUBMITTED', 'IN_APPROVAL', 'REVISION'].includes(r.status),
    );
    return ok(
      reqs.map((r: any) => {
        const steps = state.approvalSteps
          .filter((s) => s.requisitionId === r.id && s.status === 'PENDING')
          .sort((a, b) => a.level - b.level);
        const active = steps[0];
        const approver = active
          ? state.users.find((u: any) => u.id === active.assignedApproverId)
          : null;
        return {
          id: r.id,
          number: r.number,
          title: r.title,
          totalAmount: r.totalAmount,
          status: r.status,
          submittedAt: r.submittedAt,
          currentLevel: active?.level ?? r.currentTierLevel ?? null,
          currentLevelName: active?.levelName ?? null,
          currentApprover: approver
            ? { id: approver.id, name: approver.name }
            : null,
        };
      }),
    );
  }
  if (method === 'GET' && sub === 'pending') {
    const userId = getDemoSessionUserId();
    const state = getDemoState();
    const me = state.users.find((u: any) => u.id === userId);
    const isAdmin = me?.profile === 'ADMIN';
    // Admin vê todas as pendentes; demais perfis só as atribuídas a eles.
    const steps = state.approvalSteps.filter(
      (st) =>
        st.status === 'PENDING' &&
        (isAdmin ? true : st.assignedApproverId === userId),
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
    // Hidrata o assignedApprover + waiver (mesmo formato do backend).
    return ok(
      active.map((st: any) => {
        const approver = state.users.find(
          (u: any) => u.id === st.assignedApproverId,
        );
        const req = state.requisitions.find(
          (r: any) => r.id === st.requisitionId,
        );
        const requester = state.users.find(
          (u: any) => u.id === req?.requesterId,
        );
        return {
          ...st,
          assignedApprover: approver
            ? { id: approver.id, name: approver.name }
            : null,
          requisition: req
            ? {
                id: req.id,
                number: req.number,
                title: req.title,
                totalAmount: req.totalAmount,
                requester: { name: requester?.name ?? '—' },
                quotationWaiverReason: req.quotationWaiverReason ?? null,
                quotationWaiverNote: req.quotationWaiverNote ?? null,
              }
            : st.requisition,
        };
      }),
    );
  }
  if (method === 'POST' && sub && segments[2] === 'decide') {
    const stepId = sub;
    return mutateDemoState((s) => {
      const step = s.approvalSteps.find((x) => x.id === stepId);
      if (!step) return notFound();
      const userId = getDemoSessionUserId();
      const me = (s.users as any[]).find((u: any) => u.id === userId);
      const isAdmin = me?.profile === 'ADMIN';
      const isTitular = step.assignedApproverId === userId;
      const isOverride = isAdmin && !isTitular;
      const comments = String(data?.comments ?? '').trim();
      if (!isTitular && !isAdmin) {
        return { status: 403, data: { message: 'Você não é o aprovador desta etapa.' } };
      }
      if (isOverride && comments.length < 10) {
        return {
          status: 400,
          data: {
            message:
              'Decisões fora da sua alçada exigem uma justificativa de pelo menos 10 caracteres.',
          },
        };
      }
      const req = s.requisitions.find((x) => x.id === step.requisitionId);
      if (req && req.requesterId === userId) {
        if (!isAdmin) {
          return {
            status: 403,
            data: {
              message:
                'Você não pode aprovar uma requisição criada por você mesmo.',
            },
          };
        }
        if (comments.length < 10) {
          return {
            status: 400,
            data: {
              message:
                'Para aprovar um documento que você mesmo criou, escreva uma justificativa de pelo menos 10 caracteres.',
            },
          };
        }
      }
      step.status = data.approved ? 'APPROVED' : 'REJECTED';
      step.decidedById = userId;
      step.decidedAt = todayIso();
      step.comments = isOverride
        ? `[Decisão por Administrador — ${me?.name ?? '—'}] ${comments}`
        : comments || null;
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
export function handlePurchaseOrders(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
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
  if (method === 'GET' && id && action === 'history') {
    return ok(buildHistory('po', id));
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
      // Demo: simula a gravação automática no Linx — PC já nasce INTEGRATED.
      const fakeErpPedido = `DEMO${Date.now().toString().slice(-5)}`;
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
        status: 'INTEGRATED',
        paymentCondition: data.paymentCondition ?? req.paymentConditionDesc ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        expectedDelivery: data.expectedDelivery ?? null,
        totalAmount: totalAmount.toFixed(2),
        notes: null,
        currentTierLevel: null,
        erpPedido: fakeErpPedido,
        erpStagingId: null,
        integratedAt: todayIso(),
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
  // Handlers /send-to-supplier e /resend foram REMOVIDOS — o fluxo de
  // e-mail ao fornecedor não existe pra consumíveis. Em PROD/HML a
  // gravação no Linx acontece automaticamente no convert(); o demo
  // não precisa mais simular esse endpoint.
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
export function handleFundRequests(method: string, segments: string[], query: URLSearchParams): DemoResponse | null {
  const id = segments[1];
  const action = segments[2];
  const state = getDemoState();
  if (method === 'GET' && !id) {
    const filtered = filterByQuery(state.fundRequests, query, ['number', 'title']);
    return ok(paginate(filtered, query));
  }
  if (method === 'GET' && id && !action) {
    const sv = state.fundRequests.find((f) => f.id === id);
    return sv ? ok(sv) : notFound();
  }
  if (method === 'GET' && id && action === 'history') {
    return ok(buildHistory('sv', id));
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cotacoes                                                            */
/* ------------------------------------------------------------------ */

function cleanCnpj(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

function findSupplierByCnpj(state: any, cnpj: string) {
  const d = cleanCnpj(cnpj);
  if (!d) return null;
  return (
    state.suppliers.find(
      (s: any) => cleanCnpj(s.cnpjCpf ?? '') === d && !s.inativo,
    ) ?? null
  );
}

function findPaymentCondition(state: any, code: string) {
  return state.paymentConditions.find((c: any) => c.codigo === code) ?? null;
}

function hydrateQuotation(state: any, q: any) {
  const att = q.attachmentId
    ? (state.attachments ?? []).find((a: any) => a.id === q.attachmentId)
    : null;
  return {
    ...q,
    attachment: att
      ? { id: att.id, filename: att.filename, mimeType: att.mimeType }
      : null,
    createdBy: q.createdById
      ? { name: state.users.find((u: any) => u.id === q.createdById)?.name ?? '' }
      : null,
    selectedBy: q.selectedById
      ? { name: state.users.find((u: any) => u.id === q.selectedById)?.name ?? '' }
      : null,
  };
}

function handleRequisitionQuotations(
  method: string,
  reqId: string,
  data: any,
  state: any,
): DemoResponse | null {
  if (method === 'GET') {
    const list = ((state.quotations as any[]) ?? [])
      .filter((q: any) => q.requisitionId === reqId)
      .sort((a: any, b: any) => {
        if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      })
      .map((q: any) => hydrateQuotation(state, q));
    return ok(list);
  }
  if (method === 'POST') {
    return mutateDemoState((s: any) => {
      const req = s.requisitions.find((r: any) => r.id === reqId);
      if (!req) return notFound();
      if (!['DRAFT', 'REVISION'].includes(req.status)) {
        return badRequest(
          'Cotacoes so podem ser cadastradas em rascunho ou revisao.',
        );
      }
      const cnpj = cleanCnpj(data?.supplierCnpj ?? '');
      if (cnpj.length < 11) return badRequest('CNPJ invalido.');
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) return badRequest('Informe ao menos 1 item.');

      const erp = findSupplierByCnpj(s, cnpj);
      const supplierName: string =
        erp?.nome ?? (data?.supplierNameOverride ?? '').trim();
      if (!supplierName) {
        return badRequest(
          'Fornecedor nao cadastrado — informe o nome do fornecedor.',
        );
      }

      let paymentCode: string | null = data?.paymentConditionCode ?? null;
      let paymentDesc: string | null = null;
      if (paymentCode) {
        const cond = findPaymentCondition(s, paymentCode);
        if (!cond) return badRequest('Condicao de pagamento invalida.');
        paymentDesc = cond.descricao;
      } else if (erp?.condicaoPgto) {
        paymentCode = erp.condicaoPgto;
        const cond = findPaymentCondition(s, paymentCode as string);
        paymentDesc = cond?.descricao ?? null;
      }

      const total = items.reduce(
        (sum: number, it: any) =>
          sum + Number(it.quantity ?? 0) * Number(it.unitPrice ?? 0),
        0,
      );

      const id = uid('quotation');
      const quotation: any = {
        id,
        companyId: req.companyId,
        requisitionId: reqId,
        attachmentId: data?.attachmentId ?? null,
        supplierCnpj: cnpj,
        supplierName,
        supplierErpCode: erp?.codigo ?? null,
        paymentConditionCode: paymentCode,
        paymentConditionDesc: paymentDesc,
        totalAmount: total.toFixed(2),
        notes: data?.notes ?? null,
        isWinner: false,
        selectedAt: null,
        selectedById: null,
        createdAt: todayIso(),
        createdById: getDemoSessionUserId(),
        items: items.map((it: any, idx: number) => ({
          id: uid('qitem'),
          position: idx,
          description: String(it.description ?? '').trim(),
          unit: it.unit ?? null,
          quantity: String(Number(it.quantity)),
          unitPrice: String(Number(it.unitPrice)),
          totalPrice: (Number(it.quantity) * Number(it.unitPrice)).toFixed(2),
        })),
      };
      s.quotations = s.quotations ?? [];
      s.quotations.push(quotation);
      return ok(hydrateQuotation(s, quotation));
    });
  }
  return null;
}

export function handleQuotations(
  method: string,
  segments: string[],
  data: any,
): DemoResponse | null {
  const id = segments[1];
  const action = segments[2];
  if (!id) return null;

  if (method === 'PATCH' && !action) {
    return mutateDemoState((s: any) => {
      s.quotations = s.quotations ?? [];
      const q = s.quotations.find((x: any) => x.id === id);
      if (!q) return notFound();
      if (q.isWinner) {
        return badRequest(
          'Esta cotacao e a vencedora — cancele a selecao antes.',
        );
      }
      if (data?.supplierCnpj !== undefined) {
        const cnpj = cleanCnpj(data.supplierCnpj);
        const erp = findSupplierByCnpj(s, cnpj);
        const name = erp?.nome ?? (data.supplierNameOverride ?? '').trim();
        if (!name) return badRequest('Nome do fornecedor obrigatorio.');
        q.supplierCnpj = cnpj;
        q.supplierName = name;
        q.supplierErpCode = erp?.codigo ?? null;
      }
      if (data?.paymentConditionCode !== undefined) {
        if (data.paymentConditionCode) {
          const cond = findPaymentCondition(s, data.paymentConditionCode);
          if (!cond) return badRequest('Condicao de pagamento invalida.');
          q.paymentConditionCode = data.paymentConditionCode;
          q.paymentConditionDesc = cond.descricao;
        } else {
          q.paymentConditionCode = null;
          q.paymentConditionDesc = null;
        }
      }
      if (data?.notes !== undefined) q.notes = data.notes ?? null;
      if (Array.isArray(data?.items)) {
        q.items = data.items.map((it: any, idx: number) => ({
          id: uid('qitem'),
          position: idx,
          description: String(it.description ?? '').trim(),
          unit: it.unit ?? null,
          quantity: String(Number(it.quantity)),
          unitPrice: String(Number(it.unitPrice)),
          totalPrice: (Number(it.quantity) * Number(it.unitPrice)).toFixed(2),
        }));
        const total = q.items.reduce(
          (sum: number, it: any) =>
            sum + Number(it.quantity) * Number(it.unitPrice),
          0,
        );
        q.totalAmount = total.toFixed(2);
      }
      return ok(hydrateQuotation(s, q));
    });
  }

  if (method === 'DELETE' && !action) {
    return mutateDemoState((s: any) => {
      s.quotations = s.quotations ?? [];
      const idx = s.quotations.findIndex((x: any) => x.id === id);
      if (idx < 0) return notFound();
      if (s.quotations[idx].isWinner) {
        return badRequest('Cotacao vencedora — cancele a selecao antes.');
      }
      s.quotations.splice(idx, 1);
      return ok({ ok: true });
    });
  }

  if (method === 'POST' && action === 'select') {
    return mutateDemoState((s: any) => {
      s.quotations = s.quotations ?? [];
      const q = s.quotations.find((x: any) => x.id === id);
      if (!q) return notFound();
      const req = s.requisitions.find((r: any) => r.id === q.requisitionId);
      if (!req) return notFound();
      if (!['SUBMITTED', 'IN_APPROVAL', 'REVISION'].includes(req.status)) {
        return badRequest(
          'Cotacao so pode ser selecionada com a requisicao em aprovacao.',
        );
      }
      for (const other of s.quotations) {
        if (other.requisitionId === q.requisitionId && other.id !== q.id) {
          other.isWinner = false;
          other.selectedAt = null;
          other.selectedById = null;
        }
      }
      q.isWinner = true;
      q.selectedAt = todayIso();
      q.selectedById = getDemoSessionUserId();

      req.supplierErpCode = q.supplierErpCode ?? req.supplierErpCode;
      req.supplierName = q.supplierName;
      req.paymentConditionCode = q.paymentConditionCode;
      req.paymentConditionDesc = q.paymentConditionDesc;
      req.totalAmount = q.totalAmount;
      req.winningQuotationId = q.id;
      req.winningQuotationNeedsErp = q.supplierErpCode === null;

      const template = (req.items ?? [])[0];
      if (template) {
        req.items = q.items.map((qi: any) => ({
          id: uid('item'),
          requisitionId: req.id,
          itemErpCode: template.itemErpCode,
          itemDescription: qi.description,
          unit: qi.unit ?? template.unit,
          quantity: qi.quantity,
          estimatedPrice: qi.unitPrice,
          totalPrice: qi.totalPrice,
          accountingAccount: template.accountingAccount,
          accountName: template.accountName,
          branchRateioCode: template.branchRateioCode,
          branchRateioDesc: template.branchRateioDesc,
          costCenterRateioCode: template.costCenterRateioCode,
          costCenterRateioDesc: template.costCenterRateioDesc,
          notes: template.notes,
        }));
      }
      return ok(hydrateQuotation(s, q));
    });
  }

  return null;
}
