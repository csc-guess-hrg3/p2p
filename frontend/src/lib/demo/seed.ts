/**
 * Seed determinístico do modo demo. Popula:
 *   - empresa DEMO
 *   - dados de referência "ERP" simulados (filiais, fornecedores, itens,
 *     contas, condições, rateios, tipos de compra, CTB, naturezas)
 *   - 4 usuários demo (1 por perfil) numa equipe com cadeia de aprovação
 *   - 1 requisição em DRAFT (pronta para submeter)
 *   - 1 requisição IN_APPROVAL com step pendente para o gestor
 */
import { DEMO_USERS } from './catalog';

export interface DemoState {
  version: number;
  companies: any[];
  users: any[];
  team: any;
  approvalLevels: any[];
  branches: any[];
  suppliers: any[];
  items: any[];
  accounts: any[];
  paymentConditions: any[];
  branchRateios: any[];
  ccRateios: any[];
  comprasTipos: any[];
  ctbTipoOperacao: any[];
  naturezasEntrada: any[];
  requisitions: any[];
  approvalSteps: any[];
  purchaseOrders: any[];
  fundRequests: any[];
  fiscalItemRequests: any[];
  notifications: any[];
  integrationLogs: any[];
  receivings: any[];
  attachments: any[];
  paOrders: any[];
  paItems: any[];
  paGrade: any[];
  paTamanhos: any[];
}

export const DEMO_STATE_VERSION = 7;

function uid(prefix = ''): string {
  // crypto.randomUUID em browsers modernos. Fallback simples se faltar.
  const u =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}-${u}` : u;
}

function nowIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

export function buildSeed(): DemoState {
  const companyId = uid('demo-company');
  const teamId = uid('demo-team');

  const users = DEMO_USERS.map((u) => ({
    id: uid('user'),
    adUsername: u.username,
    email: `${u.username}@demo.local`,
    name: u.name,
    profile: u.profile,
    status: 'ACTIVE',
    teamId,
    companyIds: [companyId],
    companies: [{ companyId }],
    createdAt: nowIso(-7),
    updatedAt: nowIso(),
  }));

  const admin = users.find((u) => u.profile === 'ADMIN')!;
  const manager = users.find((u) => u.profile === 'MANAGER')!;
  const operator = users.find((u) => u.profile === 'OPERATOR')!;
  const reviewer = users.find((u) => u.profile === 'REVIEWER')!;

  const approvalLevels = [
    {
      id: uid('lvl'),
      teamId,
      level: 1,
      name: 'Gestor',
      approverId: manager.id,
      maxAmount: '50000',
    },
    {
      id: uid('lvl'),
      teamId,
      level: 2,
      name: 'Administrador',
      approverId: admin.id,
      maxAmount: '250000',
    },
    {
      id: uid('lvl'),
      teamId,
      level: 3,
      name: 'Diretor',
      approverId: reviewer.id,
      maxAmount: null,
    },
  ];

  // Dados de referência "ERP" (espelham views v_p2p_*)
  const branches = [
    { codigo: 'FIL-01', nome: 'Matriz São Paulo', inativo: false },
    { codigo: 'FIL-02', nome: 'Filial Rio de Janeiro', inativo: false },
    { codigo: 'FIL-03', nome: 'CD Campinas', inativo: false },
  ];

  const suppliers = [
    { codigo: 'FOR-001', nome: 'Office Supplies Ltda', razaoSocial: 'Office Supplies Comercial Ltda', cnpjCpf: '12.345.678/0001-90', email: 'vendas@officesupplies.com.br', telefone: '(11) 3000-0001', condicaoPgto: '30', inativo: false },
    { codigo: 'FOR-002', nome: 'TechParts Distribuidora', razaoSocial: 'TechParts Distribuidora S/A', cnpjCpf: '98.765.432/0001-21', email: 'comercial@techparts.com.br', telefone: '(11) 3000-0002', condicaoPgto: '30/60', inativo: false },
    { codigo: 'FOR-003', nome: 'Limpeza Total', razaoSocial: 'Limpeza Total Higienização Ltda', cnpjCpf: '11.222.333/0001-44', email: null, telefone: '(11) 3000-0003', condicaoPgto: '15', inativo: false },
    { codigo: 'FOR-004', nome: 'Gráfica Sol Nascente', razaoSocial: 'Sol Nascente Gráfica e Editora Ltda', cnpjCpf: '22.333.444/0001-55', email: 'orcamento@solnascente.com.br', telefone: '(11) 3000-0004', condicaoPgto: '30', inativo: false },
    { codigo: 'FOR-005', nome: 'Café & Cia', razaoSocial: 'Café e Cia Distribuidora Ltda', cnpjCpf: '33.444.555/0001-66', email: 'pedidos@cafeecia.com.br', telefone: '(11) 3000-0005', condicaoPgto: '0', inativo: false },
    { codigo: 'FOR-006', nome: 'Consultoria Aprende+', razaoSocial: 'Aprende+ Consultoria Empresarial', cnpjCpf: '44.555.666/0001-77', email: 'contato@aprendemais.com.br', telefone: '(11) 3000-0006', condicaoPgto: '30/60/90', inativo: false },
    { codigo: 'FOR-007', nome: 'Manutenção Veloz', razaoSocial: 'Veloz Serviços de Manutenção Predial', cnpjCpf: '55.666.777/0001-88', email: 'comercial@manutencaoveloz.com.br', telefone: '(11) 3000-0007', condicaoPgto: '15', inativo: false },
    { codigo: 'FOR-008', nome: 'TransLog Express', razaoSocial: 'TransLog Express Transportes Ltda', cnpjCpf: '66.777.888/0001-99', email: 'frete@translog.com.br', telefone: '(11) 3000-0008', condicaoPgto: '30', inativo: false },
  ];

  const items = [
    { codigo: 'IT-1001', descricao: 'Papel A4 — resma 500 folhas', unidade: 'PC', contaContabilPadrao: '4.1.01.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-01', grupo: 'Escritório', inativo: false },
    { codigo: 'IT-1002', descricao: 'Caneta esferográfica azul (cx c/ 50)', unidade: 'CX', contaContabilPadrao: '4.1.01.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-01', grupo: 'Escritório', inativo: false },
    { codigo: 'IT-1003', descricao: 'Toner laser preto compatível', unidade: 'UN', contaContabilPadrao: '4.1.01.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-01', grupo: 'Escritório', inativo: false },
    { codigo: 'IT-2001', descricao: 'Notebook 14" 16GB RAM 512GB SSD', unidade: 'UN', contaContabilPadrao: '1.2.03.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-02', grupo: 'TI', inativo: false },
    { codigo: 'IT-2002', descricao: 'Monitor 27" Full HD', unidade: 'UN', contaContabilPadrao: '1.2.03.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-02', grupo: 'TI', inativo: false },
    { codigo: 'IT-2003', descricao: 'Cadeira ergonômica', unidade: 'UN', contaContabilPadrao: '1.2.03.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-02', grupo: 'Mobiliário', inativo: false },
    { codigo: 'IT-3001', descricao: 'Detergente neutro 5L', unidade: 'GL', contaContabilPadrao: '4.1.02.001', rateioFilialPadrao: 'RAT-FIL-02', rateioCcPadrao: 'RAT-CC-03', grupo: 'Limpeza', inativo: false },
    { codigo: 'IT-3002', descricao: 'Papel higiênico (fardo c/ 64)', unidade: 'FD', contaContabilPadrao: '4.1.02.001', rateioFilialPadrao: 'RAT-FIL-02', rateioCcPadrao: 'RAT-CC-03', grupo: 'Limpeza', inativo: false },
    { codigo: 'IT-4001', descricao: 'Café torrado e moído (kg)', unidade: 'KG', contaContabilPadrao: '4.1.01.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-01', grupo: 'Copa', inativo: false },
    { codigo: 'IT-5001', descricao: 'Hora consultoria sênior', unidade: 'HR', contaContabilPadrao: '4.1.05.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-02', grupo: 'Serviços', inativo: false },
    { codigo: 'IT-5002', descricao: 'Hora manutenção predial', unidade: 'HR', contaContabilPadrao: '4.1.05.001', rateioFilialPadrao: 'RAT-FIL-01', rateioCcPadrao: 'RAT-CC-03', grupo: 'Serviços', inativo: false },
  ];

  const accounts = [
    { codigo: '4.1.01.001', nome: 'Material de Escritório', inativo: false },
    { codigo: '4.1.02.001', nome: 'Material de Limpeza', inativo: false },
    { codigo: '1.2.03.001', nome: 'Imobilizado — Equipamentos TI', inativo: false },
    { codigo: '4.1.05.001', nome: 'Serviços de Terceiros', inativo: false },
  ];

  const paymentConditions = [
    { codigo: '0', descricao: 'À vista', tipo: 'VISTA', parcelas: 1 },
    { codigo: '30', descricao: '30 dias', tipo: 'PRAZO', parcelas: 1 },
    { codigo: '30/60', descricao: '30/60 dias', tipo: 'PRAZO', parcelas: 2 },
    { codigo: '30/60/90', descricao: '30/60/90 dias', tipo: 'PRAZO', parcelas: 3 },
  ];

  const branchRateios = [
    {
      codigo: 'RAT-FIL-01',
      descricao: 'Matriz 100%',
      inativo: false,
      linhas: [{ filialCodigo: 'FIL-01', porcentagem: 100 }],
    },
    {
      codigo: 'RAT-FIL-02',
      descricao: 'Filiais 50/50',
      inativo: false,
      linhas: [
        { filialCodigo: 'FIL-01', porcentagem: 60 },
        { filialCodigo: 'FIL-02', porcentagem: 40 },
      ],
    },
  ];

  const ccRateios = [
    {
      codigo: 'RAT-CC-01',
      descricao: 'CC Administrativo',
      inativo: false,
      linhas: [
        {
          filialCodigo: 'FIL-01',
          centroCustoCodigo: 'CC-1001',
          porcentagem: 100,
        },
      ],
    },
    {
      codigo: 'RAT-CC-02',
      descricao: 'CC TI',
      inativo: false,
      linhas: [
        {
          filialCodigo: 'FIL-01',
          centroCustoCodigo: 'CC-1002',
          porcentagem: 100,
        },
      ],
    },
    {
      codigo: 'RAT-CC-03',
      descricao: 'CC Manutenção',
      inativo: false,
      linhas: [
        {
          filialCodigo: 'FIL-01',
          centroCustoCodigo: 'CC-1003',
          porcentagem: 60,
        },
        {
          filialCodigo: 'FIL-02',
          centroCustoCodigo: 'CC-1003',
          porcentagem: 40,
        },
      ],
    },
  ];

  const comprasTipos = [
    { tipoCompra: 'COMPRA DIVERSAS', aeDocumento: 'AE-NF' },
    { tipoCompra: 'CONSULTORIA', aeDocumento: 'AE-NFS' },
    { tipoCompra: 'LOCAÇÃO', aeDocumento: 'AE-ND' },
  ];

  const ctbTipoOperacao = [
    { codigo: 202, descricao: 'Compra de Material de Consumo' },
    { codigo: 203, descricao: 'Aquisição de Imobilizado' },
    { codigo: 210, descricao: 'Contratação de Serviços' },
  ];

  const naturezasEntrada = [
    { codigo: '202.01', descricao: 'Mat. Consumo - Escritório', ctbTipoOperacao: 202 },
    { codigo: '202.02', descricao: 'Mat. Consumo - Limpeza', ctbTipoOperacao: 202 },
    { codigo: '203.01', descricao: 'Imobilizado - Equipamentos TI', ctbTipoOperacao: 203 },
    { codigo: '210.01', descricao: 'Consultoria especializada', ctbTipoOperacao: 210 },
  ];

  // ────────────────────────────────────────────────────────────────
  // Geração em massa de requisições, PCs, recebimentos, SVs, anexos.
  // Mantemos REQ-DEMO-000001 (DRAFT do operador) e -000002 (IN_APPROVAL
  // com step pendente do gestor) como pontos fixos no tutorial; o resto
  // varia em status, fornecedor, datas e valores para popular as telas.
  // ────────────────────────────────────────────────────────────────

  const allItems = items.map((i) => ({
    code: i.codigo,
    desc: i.descricao,
    unit: i.unidade,
    acct: i.contaContabilPadrao,
    accountName: accounts.find((a) => a.codigo === i.contaContabilPadrao)?.nome,
    fil: i.rateioFilialPadrao,
    cc: i.rateioCcPadrao,
  }));
  const branchesArr = branches;
  const suppliersArr = suppliers;

  function makeReqItem(reqId: string, opts: { itemIdx: number; qty: number; price: number }) {
    const it = allItems[opts.itemIdx % allItems.length];
    const total = Number((opts.qty * opts.price).toFixed(2));
    return {
      id: uid('rit'),
      requisitionId: reqId,
      itemErpCode: it.code,
      itemDescription: it.desc,
      quantity: String(opts.qty),
      unit: it.unit,
      estimatedPrice: opts.price.toFixed(2),
      totalPrice: total.toFixed(2),
      accountingAccount: it.acct,
      accountName: it.accountName ?? null,
      branchRateioCode: it.fil,
      branchRateioDesc:
        branchRateios.find((r) => r.codigo === it.fil)?.descricao ?? null,
      costCenterRateioCode: it.cc,
      costCenterRateioDesc:
        ccRateios.find((r) => r.codigo === it.cc)?.descricao ?? null,
      notes: null,
      rateios: [],
    };
  }

  function makePOItemFromReqItem(poId: string, rIt: any) {
    return {
      id: uid('poit'),
      requisitionItemId: rIt.id,
      itemErpCode: rIt.itemErpCode,
      itemDescription: rIt.itemDescription,
      quantity: rIt.quantity,
      unit: rIt.unit,
      unitPrice: rIt.estimatedPrice,
      totalPrice: rIt.totalPrice,
      accountingAccount: rIt.accountingAccount,
      accountName: rIt.accountName,
      branchRateioCode: rIt.branchRateioCode,
      branchRateioDesc: rIt.branchRateioDesc,
      costCenterRateioCode: rIt.costCenterRateioCode,
      costCenterRateioDesc: rIt.costCenterRateioDesc,
      receivedQty: '0',
      notes: null,
      rateios: [],
      _poId: poId,
    };
  }

  // ── Requisições ────────────────────────────────────────────────
  const requisitions: any[] = [];
  const approvalSteps: any[] = [];
  let reqSeq = 0;
  const nextReqNumber = () =>
    `REQ-DEMO-${String(++reqSeq).padStart(6, '0')}`;

  // Helper genérico para criar requisição.
  function buildReq(opts: {
    status: 'DRAFT' | 'SUBMITTED' | 'IN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';
    supplierIdx: number;
    branchIdx?: number;
    title: string;
    justification: string;
    items: { itemIdx: number; qty: number; price: number }[];
    nfType?: 'NF_EXISTENTE' | 'NF_FUTURA' | 'SEM_NF';
    paymentCondCode?: string;
    daysAgo: number;
    fiscalReady?: boolean;
    requesterId?: string;
    pendingApproverId?: string | null;
    rejectionReason?: string | null;
    quotationsCount?: number;
  }) {
    const reqId = uid('req');
    const supplier = suppliersArr[opts.supplierIdx % suppliersArr.length];
    const branch = branchesArr[(opts.branchIdx ?? 0) % branchesArr.length];
    const cond = paymentConditions.find(
      (c) => c.codigo === (opts.paymentCondCode ?? supplier.condicaoPgto),
    ) ?? paymentConditions[1];
    const reqItems = opts.items.map((i) => makeReqItem(reqId, i));
    const total = reqItems.reduce((s, x) => s + Number(x.totalPrice), 0);
    const req = {
      id: reqId,
      number: nextReqNumber(),
      companyId,
      branchErpCode: branch.codigo,
      branchName: branch.nome,
      supplierErpCode: supplier.codigo,
      supplierName: supplier.nome,
      requesterId: opts.requesterId ?? operator.id,
      teamId,
      title: opts.title,
      justification: opts.justification,
      tipoNotaFiscal: opts.nfType ?? 'NF_EXISTENTE',
      status: opts.status,
      totalAmount: total.toFixed(2),
      paymentConditionCode: cond.codigo,
      paymentConditionDesc: cond.descricao,
      recurring: false,
      recurrenceMonths: null,
      contractRef: null,
      quotationsCount: opts.quotationsCount ?? 0,
      tipoCompra: opts.fiscalReady ? 'COMPRA DIVERSAS' : null,
      ctbTipoOperacao: opts.fiscalReady ? 202 : null,
      naturezaEntrada: opts.fiscalReady ? '202.01' : null,
      currentTierLevel: opts.status === 'IN_APPROVAL' ? 1 : null,
      submittedAt: ['DRAFT'].includes(opts.status) ? null : nowIso(-opts.daysAgo + 1),
      approvedAt: ['APPROVED', 'CONVERTED'].includes(opts.status)
        ? nowIso(-opts.daysAgo + 2)
        : null,
      rejectedAt: opts.status === 'REJECTED' ? nowIso(-opts.daysAgo + 2) : null,
      rejectionReason: opts.rejectionReason ?? null,
      createdAt: nowIso(-opts.daysAgo),
      updatedAt: nowIso(-Math.max(0, opts.daysAgo - 2)),
      requester: { id: operator.id, name: operator.name },
      items: reqItems,
      approvalSteps: [] as any[],
    };
    requisitions.push(req);

    if (opts.status === 'IN_APPROVAL' && opts.pendingApproverId) {
      const stepId = uid('step');
      approvalSteps.push({
        id: stepId,
        companyId,
        entityType: 'REQUISITION',
        requisitionId: reqId,
        purchaseOrderId: null,
        fundRequestId: null,
        teamApprovalLevelId: approvalLevels[0].id,
        level: 1,
        levelName: 'Gestor',
        assignedApproverId: opts.pendingApproverId,
        decidedById: null,
        status: 'PENDING',
        decidedAt: null,
        comments: null,
        createdAt: nowIso(-opts.daysAgo + 1),
        updatedAt: nowIso(-opts.daysAgo + 1),
        requisition: {
          id: reqId,
          number: req.number,
          title: req.title,
          totalAmount: req.totalAmount,
          requester: { name: operator.name },
        },
      });
    }
    return req;
  }

  // 1) DRAFT do operador (tutorial) — REQ-DEMO-000001
  reqSeq = 0; // reset porque os blocos abaixo recriam manualmente
  const reqDraftId = uid('req');
  const reqDraft = {
    id: reqDraftId,
    number: 'REQ-DEMO-000001',
    companyId,
    branchErpCode: 'FIL-01',
    branchName: 'Matriz São Paulo',
    supplierErpCode: 'FOR-001',
    supplierName: 'Office Supplies Ltda',
    requesterId: operator.id,
    teamId,
    title: 'Reposição de material de escritório',
    justification:
      'Reposição mensal de papel A4 e canetas para a Filial Matriz.',
    tipoNotaFiscal: 'NF_EXISTENTE',
    status: 'DRAFT',
    totalAmount: '750.00',
    paymentConditionCode: '30',
    paymentConditionDesc: '30 dias',
    recurring: false,
    recurrenceMonths: null,
    contractRef: null,
    quotationsCount: 0,
    tipoCompra: null,
    ctbTipoOperacao: null,
    naturezaEntrada: null,
    currentTierLevel: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: nowIso(-1),
    updatedAt: nowIso(-1),
    requester: { id: operator.id, name: operator.name },
    items: [
      {
        id: uid('rit'),
        requisitionId: reqDraftId,
        itemErpCode: 'IT-1001',
        itemDescription: 'Papel A4 — resma 500 folhas',
        quantity: '20',
        unit: 'PC',
        estimatedPrice: '25.00',
        totalPrice: '500.00',
        accountingAccount: '4.1.01.001',
        accountName: 'Material de Escritório',
        branchRateioCode: 'RAT-FIL-01',
        branchRateioDesc: 'Matriz 100%',
        costCenterRateioCode: 'RAT-CC-01',
        costCenterRateioDesc: 'CC Administrativo',
        notes: null,
        rateios: [],
      },
      {
        id: uid('rit'),
        requisitionId: reqDraftId,
        itemErpCode: 'IT-1002',
        itemDescription: 'Caneta esferográfica azul (cx c/ 50)',
        quantity: '5',
        unit: 'CX',
        estimatedPrice: '50.00',
        totalPrice: '250.00',
        accountingAccount: '4.1.01.001',
        accountName: 'Material de Escritório',
        branchRateioCode: 'RAT-FIL-01',
        branchRateioDesc: 'Matriz 100%',
        costCenterRateioCode: 'RAT-CC-01',
        costCenterRateioDesc: 'CC Administrativo',
        notes: null,
        rateios: [],
      },
    ],
    approvalSteps: [],
  };

  // Requisição IN_APPROVAL (gestor tem um step pendente) — total 18.500
  const reqApprId = uid('req');
  const stepGestorId = uid('step');
  const reqAppr = {
    id: reqApprId,
    number: 'REQ-DEMO-000002',
    companyId,
    branchErpCode: 'FIL-01',
    branchName: 'Matriz São Paulo',
    supplierErpCode: 'FOR-002',
    supplierName: 'TechParts Distribuidora',
    requesterId: operator.id,
    teamId,
    title: 'Aquisição de notebooks para nova squad',
    justification:
      'Equipar 4 desenvolvedores recém-contratados para o squad de plataforma.',
    tipoNotaFiscal: 'NF_EXISTENTE',
    status: 'IN_APPROVAL',
    totalAmount: '18500.00',
    paymentConditionCode: '30/60',
    paymentConditionDesc: '30/60 dias',
    recurring: false,
    recurrenceMonths: null,
    contractRef: null,
    quotationsCount: 3,
    tipoCompra: 'COMPRA DIVERSAS',
    ctbTipoOperacao: 203,
    naturezaEntrada: '203.01',
    currentTierLevel: 1,
    submittedAt: nowIso(-1),
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: nowIso(-2),
    updatedAt: nowIso(-1),
    requester: { id: operator.id, name: operator.name },
    items: [
      {
        id: uid('rit'),
        requisitionId: reqApprId,
        itemErpCode: 'IT-2001',
        itemDescription: 'Notebook 14" 16GB RAM 512GB SSD',
        quantity: '4',
        unit: 'UN',
        estimatedPrice: '4625.00',
        totalPrice: '18500.00',
        accountingAccount: '1.2.03.001',
        accountName: 'Imobilizado — Equipamentos TI',
        branchRateioCode: 'RAT-FIL-01',
        branchRateioDesc: 'Matriz 100%',
        costCenterRateioCode: 'RAT-CC-02',
        costCenterRateioDesc: 'CC TI',
        notes: null,
        rateios: [],
      },
    ],
    approvalSteps: [],
  };

  const stepGestor = {
    id: stepGestorId,
    companyId,
    entityType: 'REQUISITION',
    requisitionId: reqApprId,
    purchaseOrderId: null,
    fundRequestId: null,
    teamApprovalLevelId: approvalLevels[0].id,
    level: 1,
    levelName: 'Gestor',
    assignedApproverId: manager.id,
    decidedById: null,
    status: 'PENDING',
    decidedAt: null,
    comments: null,
    createdAt: nowIso(-1),
    updatedAt: nowIso(-1),
    requisition: {
      id: reqApprId,
      number: reqAppr.number,
      title: reqAppr.title,
      totalAmount: reqAppr.totalAmount,
      requester: { name: operator.name },
    },
  };

  // Pega o trilho dos exemplos hardcoded e abre espaço para os bulk.
  requisitions.push(reqDraft, reqAppr);
  approvalSteps.push(stepGestor);
  reqSeq = 2;

  // 13+ requisições adicionais variando status, fornecedor e valor.
  buildReq({
    status: 'IN_APPROVAL',
    supplierIdx: 4, // Café & Cia
    title: 'Compra mensal de café para a copa',
    justification: 'Reposição da copa central — consumo médio mensal de 8kg.',
    items: [{ itemIdx: 8 /* IT-4001 */, qty: 8, price: 65 }],
    daysAgo: 2,
    pendingApproverId: manager.id,
    quotationsCount: 1,
  });
  buildReq({
    status: 'IN_APPROVAL',
    supplierIdx: 5, // Consultoria Aprende+
    title: 'Consultoria de processos de compras',
    justification:
      'Mapeamento e otimização dos processos da área de suprimentos.',
    items: [{ itemIdx: 9 /* IT-5001 */, qty: 40, price: 320 }],
    daysAgo: 3,
    pendingApproverId: manager.id,
    quotationsCount: 3,
  });
  buildReq({
    status: 'APPROVED',
    supplierIdx: 0,
    title: 'Toner para impressoras do administrativo',
    justification: 'Reposição de toner — 6 unidades por bimestre.',
    items: [{ itemIdx: 2 /* IT-1003 */, qty: 6, price: 180 }],
    daysAgo: 5,
    fiscalReady: true,
  });
  buildReq({
    status: 'APPROVED',
    supplierIdx: 2,
    title: 'Material de limpeza — trimestre',
    justification: 'Reposição de detergente e papel higiênico das 3 filiais.',
    items: [
      { itemIdx: 6 /* IT-3001 */, qty: 30, price: 28 },
      { itemIdx: 7 /* IT-3002 */, qty: 12, price: 95 },
    ],
    daysAgo: 4,
    fiscalReady: false, // ainda sem classificação fiscal — útil pra testar o banner
  });
  buildReq({
    status: 'APPROVED',
    supplierIdx: 1,
    title: '2 monitores 27" para a equipe de design',
    justification: 'Substituição de monitores antigos da equipe de design.',
    items: [{ itemIdx: 4 /* IT-2002 */, qty: 2, price: 1280 }],
    daysAgo: 6,
    nfType: 'NF_FUTURA',
    fiscalReady: true,
    quotationsCount: 3,
  });
  buildReq({
    status: 'REJECTED',
    supplierIdx: 5,
    title: 'Treinamento de liderança (90 horas)',
    justification: 'Programa de desenvolvimento para gerentes de área.',
    items: [{ itemIdx: 9, qty: 90, price: 350 }],
    daysAgo: 8,
    rejectionReason:
      'Postergado para o próximo ciclo — sem verba disponível neste trimestre.',
    quotationsCount: 2,
  });
  buildReq({
    status: 'REJECTED',
    supplierIdx: 7,
    title: 'Frete extra para evento corporativo',
    justification: 'Transporte de materiais para o evento de fim de ano.',
    items: [{ itemIdx: 9, qty: 6, price: 480 }],
    daysAgo: 10,
    rejectionReason: 'Valor acima do esperado — buscar novas cotações.',
  });
  buildReq({
    status: 'CANCELLED',
    supplierIdx: 0,
    title: 'Compra de canetas (cancelada)',
    justification: 'Já temos estoque suficiente — não precisa comprar agora.',
    items: [{ itemIdx: 1, qty: 10, price: 50 }],
    daysAgo: 7,
  });
  // 6 que viram PC (status CONVERTED) — vamos gerar os PCs em seguida
  const reqsForPo: any[] = [];
  for (let i = 0; i < 6; i++) {
    const supplierIdx = (i + 1) % suppliersArr.length;
    const branchIdx = i % branchesArr.length;
    const itemIdx = (i * 2) % allItems.length;
    const qty = 3 + i;
    const price = 350 + i * 120;
    reqsForPo.push(
      buildReq({
        status: 'CONVERTED',
        supplierIdx,
        branchIdx,
        title: `Pedido recorrente ${i + 1} — operacional`,
        justification: 'Compra rotineira já convertida em pedido de compra.',
        items: [{ itemIdx, qty, price }],
        daysAgo: 14 - i,
        fiscalReady: true,
        nfType: i % 4 === 0 ? 'NF_FUTURA' : 'NF_EXISTENTE',
        quotationsCount: 3,
      }),
    );
  }

  // ── Pedidos de Compra ─────────────────────────────────────────
  const purchaseOrders: any[] = [];
  const fundRequests: any[] = [];
  const receivings: any[] = [];
  const attachmentsList: any[] = [];
  const integrationLogs: any[] = [];

  let poSeq = 0;
  const nextPoNumber = () => `OC-DEMO-${String(++poSeq).padStart(6, '0')}`;
  let svSeq = 0;
  const nextSvNumber = () => `SV-DEMO-${String(++svSeq).padStart(6, '0')}`;
  let recSeq = 0;
  const nextRecNumber = () => `REC-DEMO-${String(++recSeq).padStart(6, '0')}`;

  function buildPoFromReq(
    req: any,
    opts: {
      status:
        | 'APPROVED'
        | 'SENT_TO_SUPPLIER'
        | 'PARTIALLY_RECEIVED'
        | 'FULLY_RECEIVED'
        | 'INTEGRATED'
        | 'CANCELLED';
      deliveryOffsetDays: number; // dias a partir de hoje
      sentDaysAgo?: number | null;
      cancellationReason?: string | null;
    },
  ) {
    const poId = uid('po');
    const poItems = req.items.map((it: any) => makePOItemFromReqItem(poId, it));
    const total = poItems.reduce(
      (s: number, x: any) => s + Number(x.totalPrice),
      0,
    );
    const integrated = opts.status === 'INTEGRATED';
    const sent = opts.sentDaysAgo != null;
    const po: any = {
      id: poId,
      number: nextPoNumber(),
      requisitionId: req.id,
      companyId: req.companyId,
      branchErpCode: req.branchErpCode,
      branchName: req.branchName,
      supplierErpCode: req.supplierErpCode,
      supplierName: req.supplierName,
      buyerId: operator.id,
      status: opts.status,
      paymentCondition: req.paymentConditionDesc,
      deliveryAddress: null,
      expectedDelivery: nowIso(opts.deliveryOffsetDays),
      totalAmount: total.toFixed(2),
      notes: null,
      currentTierLevel: null,
      erpPedido: sent || integrated ? `DEMO${10000 + poSeq}` : null,
      erpStagingId: null,
      integratedAt: sent || integrated ? nowIso(-(opts.sentDaysAgo ?? 0)) : null,
      submittedAt: req.submittedAt,
      approvedAt: req.approvedAt,
      sentToSupplierAt: sent ? nowIso(-(opts.sentDaysAgo ?? 0)) : null,
      cancelledAt: opts.status === 'CANCELLED' ? nowIso(-1) : null,
      cancellationReason: opts.cancellationReason ?? null,
      createdAt: req.createdAt,
      updatedAt: nowIso(),
      items: poItems,
      buyer: { id: operator.id, name: operator.name },
      receivings: [],
      fundRequest: null,
    };
    purchaseOrders.push(po);

    if (sent || integrated) {
      integrationLogs.push({
        id: uid('log'),
        companyId,
        source: 'ERP_DEMO',
        jobType: 'SEND_PO',
        status: 'SUCCESS',
        recordsProcessed: 1 + po.items.length,
        durationMs: 200 + Math.floor(Math.random() * 300),
        errorDetails: null,
        executedAt: po.sentToSupplierAt ?? nowIso(-1),
      });
    }

    // SV de adiantamento para NF_FUTURA
    if (req.tipoNotaFiscal === 'NF_FUTURA') {
      const sv = {
        id: uid('sv'),
        number: nextSvNumber(),
        companyId,
        requisitionId: req.id,
        purchaseOrderId: po.id,
        requesterId: operator.id,
        title: `Adiantamento — ${req.title}`,
        status: opts.status === 'CANCELLED' ? 'CANCELLED' : 'APPROVED',
        totalAmount: po.totalAmount,
        currentTierLevel: null,
        erpSolicitacao: null,
        erpStagingId: null,
        integratedAt: null,
        submittedAt: po.submittedAt,
        approvedAt: po.approvedAt,
        rejectedAt: null,
        rejectionReason: null,
        createdAt: po.createdAt,
        updatedAt: nowIso(),
        items: [],
        requester: { id: operator.id, name: operator.name },
        purchaseOrder: { id: po.id, number: po.number },
      };
      fundRequests.push(sv);
      po.fundRequest = { id: sv.id, number: sv.number };
    }
    return po;
  }

  // Map 1:1 com as requisições CONVERTED
  reqsForPo.forEach((req, idx) => {
    const variants: any[] = [
      { status: 'SENT_TO_SUPPLIER', deliveryOffsetDays: -5, sentDaysAgo: 3 }, // atrasado vermelho
      { status: 'SENT_TO_SUPPLIER', deliveryOffsetDays: 3, sentDaysAgo: 1 }, // vencendo amarelo
      { status: 'PARTIALLY_RECEIVED', deliveryOffsetDays: 10, sentDaysAgo: 4 },
      { status: 'FULLY_RECEIVED', deliveryOffsetDays: -2, sentDaysAgo: 8 },
      { status: 'INTEGRATED', deliveryOffsetDays: 20, sentDaysAgo: 5 },
      { status: 'APPROVED', deliveryOffsetDays: 12, sentDaysAgo: null },
    ];
    const v = variants[idx % variants.length];
    buildPoFromReq(req, v);
  });

  // PCs adicionais "soltos" para chegar a ~20 (criamos requisições rápidas)
  for (let i = 0; i < 14; i++) {
    const sIdx = (i + 3) % suppliersArr.length;
    const itIdx = (i + 4) % allItems.length;
    const qty = 1 + (i % 5);
    const price = 220 + (i % 7) * 90;
    const fastReq = buildReq({
      status: 'CONVERTED',
      supplierIdx: sIdx,
      branchIdx: i % branchesArr.length,
      title: `Compra ${i + 7} — recorrente`,
      justification: 'Pedido de reposição operacional.',
      items: [{ itemIdx: itIdx, qty, price }],
      daysAgo: 12 + i,
      fiscalReady: true,
      nfType: i % 5 === 0 ? 'NF_FUTURA' : 'NF_EXISTENTE',
      quotationsCount: i % 3,
    });
    // Distribuição de status
    const cycle = [
      { status: 'SENT_TO_SUPPLIER', deliveryOffsetDays: -7, sentDaysAgo: 5 }, // atrasado
      { status: 'SENT_TO_SUPPLIER', deliveryOffsetDays: 5, sentDaysAgo: 2 },
      { status: 'PARTIALLY_RECEIVED', deliveryOffsetDays: 15, sentDaysAgo: 6 },
      { status: 'FULLY_RECEIVED', deliveryOffsetDays: -10, sentDaysAgo: 12 },
      { status: 'APPROVED', deliveryOffsetDays: 18, sentDaysAgo: null },
      { status: 'INTEGRATED', deliveryOffsetDays: 25, sentDaysAgo: 8 },
      { status: 'CANCELLED', deliveryOffsetDays: 30, sentDaysAgo: null,
        cancellationReason: 'Fornecedor sem disponibilidade no prazo.' },
    ];
    const v = cycle[i % cycle.length];
    buildPoFromReq(fastReq, v as any);
  }

  // ── Recebimentos ───────────────────────────────────────────────
  // Para cada PC em PARTIALLY_RECEIVED ou FULLY_RECEIVED, gera um
  // recebimento confirmado (e marca o recebido nos itens do PC). Para
  // alguns SENT_TO_SUPPLIER, cria um recebimento em DRAFT (aguardando
  // confirmação) — útil pra ver os 3 status na lista.
  let draftRecCount = 0;
  for (const po of purchaseOrders) {
    if (po.status === 'FULLY_RECEIVED') {
      const recItems = po.items.map((it: any) => ({
        id: uid('recit'),
        purchaseOrderItemId: it.id,
        receivedQty: it.quantity,
        acceptedQty: it.quantity,
        rejectedQty: '0',
        rejectionReason: null,
      }));
      po.items.forEach((it: any) => (it.receivedQty = it.quantity));
      receivings.push({
        id: uid('rec'),
        number: nextRecNumber(),
        purchaseOrderId: po.id,
        companyId,
        receivedById: operator.id,
        status: 'CONFIRMED',
        receivedAt: nowIso(-2),
        measurementStart: null,
        measurementEnd: null,
        completionPct: null,
        notes: 'Entrega conforme pedido.',
        divergenceNotes: null,
        confirmedAt: nowIso(-1),
        createdAt: nowIso(-3),
        updatedAt: nowIso(-1),
        receivedBy: { id: operator.id, name: operator.name },
        purchaseOrder: { id: po.id, number: po.number, status: po.status },
        items: recItems,
      });
    } else if (po.status === 'PARTIALLY_RECEIVED') {
      const recItems = po.items.map((it: any) => {
        const half = Number((Number(it.quantity) * 0.5).toFixed(4));
        return {
          id: uid('recit'),
          purchaseOrderItemId: it.id,
          receivedQty: half.toString(),
          acceptedQty: half.toString(),
          rejectedQty: '0',
          rejectionReason: null,
        };
      });
      po.items.forEach((it: any) => {
        it.receivedQty = (Number(it.quantity) * 0.5).toFixed(4);
      });
      receivings.push({
        id: uid('rec'),
        number: nextRecNumber(),
        purchaseOrderId: po.id,
        companyId,
        receivedById: operator.id,
        status: 'CONFIRMED',
        receivedAt: nowIso(-1),
        measurementStart: null,
        measurementEnd: null,
        completionPct: null,
        notes: 'Recebimento parcial — restante na próxima semana.',
        divergenceNotes: null,
        confirmedAt: nowIso(-1),
        createdAt: nowIso(-1),
        updatedAt: nowIso(-1),
        receivedBy: { id: operator.id, name: operator.name },
        purchaseOrder: { id: po.id, number: po.number, status: po.status },
        items: recItems,
      });
    } else if (
      po.status === 'SENT_TO_SUPPLIER' &&
      draftRecCount < 2
    ) {
      const recItems = po.items.map((it: any) => ({
        id: uid('recit'),
        purchaseOrderItemId: it.id,
        receivedQty: it.quantity,
        acceptedQty: (Number(it.quantity) - 1).toString(),
        rejectedQty: '1',
        rejectionReason: 'Embalagem amassada — avaliando troca.',
      }));
      receivings.push({
        id: uid('rec'),
        number: nextRecNumber(),
        purchaseOrderId: po.id,
        companyId,
        receivedById: operator.id,
        status: 'DRAFT',
        receivedAt: nowIso(0),
        measurementStart: null,
        measurementEnd: null,
        completionPct: null,
        notes: 'Aguardando inspeção do almoxarifado.',
        divergenceNotes: null,
        confirmedAt: null,
        createdAt: nowIso(0),
        updatedAt: nowIso(0),
        receivedBy: { id: operator.id, name: operator.name },
        purchaseOrder: { id: po.id, number: po.number, status: po.status },
        items: recItems,
      });
      draftRecCount++;
    }
  }

  // 1 recebimento DIVERGENT (já confirmado com rejeição alta)
  const divergentPo = purchaseOrders.find((p) => p.status === 'FULLY_RECEIVED');
  if (divergentPo) {
    receivings.push({
      id: uid('rec'),
      number: nextRecNumber(),
      purchaseOrderId: divergentPo.id,
      companyId,
      receivedById: operator.id,
      status: 'DIVERGENT',
      receivedAt: nowIso(-4),
      measurementStart: null,
      measurementEnd: null,
      completionPct: null,
      notes: 'Recebimento anterior com 30% de rejeição (substituição via troca).',
      divergenceNotes: 'Rejeição de 30,00% (tolerância 2%).',
      confirmedAt: nowIso(-4),
      createdAt: nowIso(-5),
      updatedAt: nowIso(-4),
      receivedBy: { id: operator.id, name: operator.name },
      purchaseOrder: {
        id: divergentPo.id,
        number: divergentPo.number,
        status: divergentPo.status,
      },
      items: divergentPo.items.map((it: any) => ({
        id: uid('recit'),
        purchaseOrderItemId: it.id,
        receivedQty: it.quantity,
        acceptedQty: (Number(it.quantity) * 0.7).toFixed(4),
        rejectedQty: (Number(it.quantity) * 0.3).toFixed(4),
        rejectionReason: 'Itens fora de especificação.',
      })),
    });
  }

  // ── Alguns anexos mock ─────────────────────────────────────────
  receivings.slice(0, 3).forEach((rec, i) => {
    attachmentsList.push({
      id: uid('att'),
      companyId,
      receivingId: rec.id,
      filename: `canhoto-${rec.number}.pdf`,
      storageKey: `demo/${rec.id}/canhoto.pdf`,
      sizeBytes: 184 * 1024 + i * 1024,
      mimeType: 'application/pdf',
      uploadedById: operator.id,
      createdAt: nowIso(-2),
    });
  });

  // ── Pedidos de Produto Acabado (PA) — vêm do "ERP" no demo ─────
  // Estrutura espelha as views v_p2p_product_orders /
  // v_p2p_product_order_items / v_p2p_product_order_grade.
  const paTamanhos = [
    { grade: 'PMG', posicao: 1, tamanho: 'P' },
    { grade: 'PMG', posicao: 2, tamanho: 'M' },
    { grade: 'PMG', posicao: 3, tamanho: 'G' },
    { grade: 'PMG', posicao: 4, tamanho: 'GG' },
    { grade: '36-44', posicao: 1, tamanho: '36' },
    { grade: '36-44', posicao: 2, tamanho: '38' },
    { grade: '36-44', posicao: 3, tamanho: '40' },
    { grade: '36-44', posicao: 4, tamanho: '42' },
    { grade: '36-44', posicao: 5, tamanho: '44' },
  ];
  const paOrders: any[] = [];
  const paItems: any[] = [];
  const paGrade: any[] = [];
  interface PaSeedItem {
    produto: string;
    cor: string;
    grade: string;
    dist: number[];
    custo: string;
    cancelDist?: number[];
  }
  interface PaSeed {
    pedido: string;
    fornecedor: string;
    filial: string;
    status: string;
    total: string;
    qtde: number;
    emissaoDays: number;
    items: PaSeedItem[];
  }
  const paOrderSeeds: PaSeed[] = [
    {
      pedido: '60290',
      fornecedor: 'SCARF ME',
      filial: 'CD SÃO PAULO',
      status: 'P',
      total: '4980.00',
      qtde: 60,
      emissaoDays: 1,
      items: [
        { produto: 'MB0RPOKS002', cor: 'DTSK', grade: 'PMG', dist: [10, 20, 20, 10], custo: '83.00' },
      ],
    },
    {
      pedido: '60291',
      fornecedor: 'K2 INDUSTRIA',
      filial: 'CD SÃO PAULO',
      status: 'P',
      total: '27180.00',
      qtde: 300,
      emissaoDays: 2,
      items: [
        { produto: 'MB0RPOKS002', cor: 'BLK', grade: 'PMG', dist: [30, 70, 70, 30], custo: '45.30' },
        { produto: 'MB0RPOKS002', cor: 'WHT', grade: 'PMG', dist: [30, 70, 70, 30], custo: '45.30' },
      ],
    },
    {
      pedido: '60292',
      fornecedor: 'ARTAR',
      filial: 'CD CAMPINAS',
      status: 'P',
      total: '7400.00',
      qtde: 80,
      emissaoDays: 3,
      items: [
        { produto: 'W261TOPKE52E', cor: 'WNSLM', grade: '36-44', dist: [10, 20, 20, 20, 10], custo: '92.50' },
      ],
    },
    {
      pedido: '60275',
      fornecedor: 'SCARF ME',
      filial: 'CD SÃO PAULO',
      status: 'E',
      total: '3000.00',
      qtde: 50,
      emissaoDays: 5,
      items: [
        { produto: 'MB0RPOKS002', cor: 'SQSE', grade: 'PMG', dist: [10, 15, 15, 10], custo: '60.00' },
      ],
    },
    {
      pedido: '60260',
      fornecedor: 'K2 INDUSTRIA',
      filial: 'CD SÃO PAULO',
      status: 'A',
      total: '13590.00',
      qtde: 150,
      emissaoDays: 10,
      items: [
        { produto: 'MB0RPOKS002', cor: 'DTSK', grade: 'PMG', dist: [15, 42, 48, 30], custo: '90.60' },
        { produto: 'MB0RPOKS002', cor: 'SQSE', grade: 'PMG', dist: [15, 42, 48, 30], custo: '90.60' },
      ],
    },
    {
      pedido: '60240',
      fornecedor: 'ARTAR',
      filial: 'CD CAMPINAS',
      status: 'R',
      total: '12000.00',
      qtde: 100,
      emissaoDays: 12,
      items: [
        { produto: 'W261TOPKE52E', cor: 'WNSLM', grade: '36-44', dist: [15, 25, 25, 25, 10], custo: '120.00' },
      ],
    },
    {
      pedido: '60220',
      fornecedor: 'SCARF ME',
      filial: 'CD SÃO PAULO',
      status: 'A',
      total: '6000.00',
      qtde: 100,
      emissaoDays: 18,
      items: [
        // Header 'A' mas com cancelamento parcial dos itens
        { produto: 'MB0RPOKS002', cor: 'BLK', grade: 'PMG', dist: [20, 30, 30, 20], custo: '60.00', cancelDist: [5, 10, 10, 5] },
      ],
    },
    {
      pedido: '60200',
      fornecedor: 'K2 INDUSTRIA',
      filial: 'CD SÃO PAULO',
      status: 'A',
      total: '4500.00',
      qtde: 75,
      emissaoDays: 22,
      items: [
        // Header 'A' mas com TODOS os itens totalmente cancelados → status efetivo 'C'
        { produto: 'MB0RPOKS002', cor: 'WHT', grade: 'PMG', dist: [15, 20, 25, 15], custo: '60.00', cancelDist: [15, 20, 25, 15] },
      ],
    },
  ];
  for (const seed of paOrderSeeds) {
    const totalQtde = seed.items.reduce(
      (s, it) => s + it.dist.reduce((a, b) => a + b, 0),
      0,
    );
    const totalCancelada = seed.items.reduce(
      (s, it) =>
        s + (it.cancelDist ?? []).reduce((a, b) => a + b, 0),
      0,
    );
    // Status efetivo (mesma lógica da view SQL):
    let statusEfetivo: string = seed.status;
    if (seed.status !== 'C' && seed.status !== 'R') {
      if (totalQtde > 0 && totalCancelada >= totalQtde) statusEfetivo = 'C';
      else if (totalCancelada > 0) statusEfetivo = 'CP';
    }
    paOrders.push({
      empresa: 'DEMO',
      pedido: seed.pedido,
      fornecedor: seed.fornecedor,
      filial: seed.filial,
      condicao_pgto: '030',
      moeda: 'R$',
      status_compra: seed.status,
      status_aprovacao:
        seed.status === 'A' ? 'A' : seed.status === 'R' ? 'R' : 'P',
      status_efetivo: statusEfetivo,
      lx_status_compra: seed.status === 'A' ? 1 : null,
      tipo_compra: 'PRODUTO ACABADO',
      natureza_entrada: '200.01',
      emissao: nowIso(-seed.emissaoDays),
      cadastramento: nowIso(-seed.emissaoDays),
      data_aprovacao: seed.status === 'A' ? nowIso(-seed.emissaoDays + 2) : null,
      aprovado_por: seed.status === 'A' ? manager.name : null,
      requerido_por: operator.name,
      tot_qtde_original: totalQtde,
      tot_qtde_cancelada: totalCancelada,
      tot_qtde_entregar: seed.status === 'A' ? totalQtde - totalCancelada : 0,
      tot_valor_original: seed.total,
      tot_valor_entregar: seed.status === 'A' ? seed.total : '0.00',
      obs:
        seed.status === 'P'
          ? 'Aguardando aprovação do diretor da marca.'
          : seed.status === 'E'
            ? 'Em estudo pela equipe de compras.'
            : null,
    });
    for (const it of seed.items) {
      const qty = it.dist.reduce((a, b) => a + b, 0);
      const qtyCancel =
        (it.cancelDist ?? []).reduce((a, b) => a + b, 0);
      const valor = (qty * Number(it.custo)).toFixed(2);
      const entrega = nowIso(-seed.emissaoDays + 30);
      paItems.push({
        empresa: 'DEMO',
        pedido: seed.pedido,
        produto: it.produto,
        cor: it.cor,
        entrega,
        limite_entrega: entrega,
        chegada_prevista: null,
        data_confirmacao: null,
        qtde_original: qty,
        qtde_cancelada: qtyCancel,
        qtde_entregue: 0,
        qtde_entregar: qty - qtyCancel,
        valor_original: valor,
        valor_entregue: '0.00',
        valor_entregar: ((qty - qtyCancel) * Number(it.custo)).toFixed(2),
        custo_unit: it.custo,
        ipi_pct: '0.00',
        desconto_item: '0.00',
        obs_item: null,
        _grade: it.grade,
      });
      it.dist.forEach((q, idx) => {
        if (q > 0) {
          paGrade.push({
            empresa: 'DEMO',
            pedido: seed.pedido,
            produto: it.produto,
            cor: it.cor,
            entrega,
            posicao: idx + 1,
            qtde_original: q,
            qtde_entregue: 0,
            grade: it.grade,
          });
        }
      });
    }
  }

  return {
    version: DEMO_STATE_VERSION,
    companies: [
      {
        id: companyId,
        code: 'DEMO',
        name: 'Empresa Demonstração',
        cnpj: '00.000.000/0001-00',
        erpDbName: 'DEMO_ERP',
        active: true,
      },
    ],
    users,
    team: {
      id: teamId,
      name: 'Equipe Demo',
      managerId: manager.id,
      isFiscal: false,
      active: true,
    },
    approvalLevels,
    branches,
    suppliers,
    items,
    accounts,
    paymentConditions,
    branchRateios,
    ccRateios,
    comprasTipos,
    ctbTipoOperacao,
    naturezasEntrada,
    requisitions,
    approvalSteps,
    purchaseOrders,
    fundRequests,
    fiscalItemRequests: [],
    // Notificações exemplo — uma por usuário pra cada cair com algo no sino.
    notifications: users.map((u, idx) => ({
      id: uid('notif'),
      companyId,
      userId: u.id,
      type: 'WELCOME',
      title: 'Bem-vindo ao modo demonstração',
      body:
        'Esta é uma notificação de exemplo — os dados são gerados pelo ' +
        'seed e nada é persistido no servidor.',
      entityType: null,
      entityId: null,
      readAt: idx % 2 === 0 ? null : nowIso(-1),
      createdAt: nowIso(-idx),
    })),
    integrationLogs,
    receivings,
    attachments: attachmentsList,
    paOrders,
    paItems,
    paGrade,
    paTamanhos,
  };
}
