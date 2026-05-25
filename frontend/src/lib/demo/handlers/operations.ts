/**
 * Handlers operacionais: recebimentos, anexos, pedidos de PA,
 * pendências fiscais.
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
  type DemoResponse,
} from './_shared';

export function handleReceiving(
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
export function handleAttachments(
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
export function handleProductOrdersPa(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  // /product-orders-pa/:company/:pedido?/(grade|approve|reject)?
  const pedido = segments[2];
  const sub = segments[3];

  if (method === 'POST' && pedido && (sub === 'approve' || sub === 'reject')) {
    return mutateDemoState((s: any) => {
      const po = (s.paOrders ?? []).find((r: any) => r.pedido === pedido);
      if (!po) return notFound();
      const cur = (po.status_compra ?? '').trim();
      if (cur !== 'E') {
        return badRequest(
          `Pedido em status "${cur}" — só pedidos em estudo podem ser decididos.`,
        );
      }
      const userId = getDemoSessionUserId();
      const user = s.users.find((u: any) => u.id === userId);
      const name = user?.name ?? 'Demo';
      if (sub === 'approve') {
        po.status_compra = 'A';
        po.status_aprovacao = 'A';
        po.lx_status_compra = 1;
        po.data_aprovacao = todayIso();
        po.aprovado_por = name;
      } else {
        const reason = String(data?.reason ?? '').trim();
        if (reason.length < 10) {
          return badRequest('Motivo precisa ter no mínimo 10 caracteres.');
        }
        po.status_compra = 'R';
        po.status_aprovacao = 'R';
        po.obs = `${po.obs ?? ''}\n\nREPROVADO POR ${name}: ${reason}`.trim();
      }
      const items = (s.paItems ?? []).filter((i: any) => i.pedido === pedido);
      return ok({ ...po, items, canApprovePa: true });
    });
  }

  if (method !== 'GET') return null;

  if (!pedido) {
    let rows = (state.paOrders ?? []) as any[];
    const status = query.get('status');
    if (status && status !== 'ALL') {
      // Filtra por status_efetivo (derivado do cancelamento por item) —
      // se o pedido tem header 'A' mas todos os itens cancelados, ele
      // sai de "Aprovados" e aparece em "Cancelados", como esperado.
      rows = rows.filter(
        (r) =>
          ((r.status_efetivo ?? r.status_compra) ?? '').trim() === status,
      );
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
    // No demo, qualquer usuário logado é o "diretor da marca" — simplifica
    // a navegação sem precisar de tela admin de paApproverUserId.
    return ok({ ...header, items, canApprovePa: true });
  }
  return null;
}
export function handleFiscalItemRequests(method: string, segments: string[], query: URLSearchParams, data?: any): DemoResponse | null {
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
