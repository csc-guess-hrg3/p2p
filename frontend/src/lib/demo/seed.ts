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
}

export const DEMO_STATE_VERSION = 2;

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
    {
      codigo: 'FOR-001',
      nome: 'Office Supplies Ltda',
      razaoSocial: 'Office Supplies Comercial Ltda',
      cnpjCpf: '12.345.678/0001-90',
      email: 'vendas@officesupplies.com.br',
      telefone: '(11) 3000-0001',
      condicaoPgto: '30',
      inativo: false,
    },
    {
      codigo: 'FOR-002',
      nome: 'TechParts Distribuidora',
      razaoSocial: 'TechParts Distribuidora S/A',
      cnpjCpf: '98.765.432/0001-21',
      email: 'comercial@techparts.com.br',
      telefone: '(11) 3000-0002',
      condicaoPgto: '30/60',
      inativo: false,
    },
    {
      codigo: 'FOR-003',
      nome: 'Limpeza Total',
      razaoSocial: 'Limpeza Total Higienização Ltda',
      cnpjCpf: '11.222.333/0001-44',
      email: null,
      telefone: '(11) 3000-0003',
      condicaoPgto: '15',
      inativo: false,
    },
  ];

  const items = [
    {
      codigo: 'IT-1001',
      descricao: 'Papel A4 — resma 500 folhas',
      unidade: 'PC',
      contaContabilPadrao: '4.1.01.001',
      rateioFilialPadrao: 'RAT-FIL-01',
      rateioCcPadrao: 'RAT-CC-01',
      grupo: 'Escritório',
      inativo: false,
    },
    {
      codigo: 'IT-1002',
      descricao: 'Caneta esferográfica azul (cx c/ 50)',
      unidade: 'CX',
      contaContabilPadrao: '4.1.01.001',
      rateioFilialPadrao: 'RAT-FIL-01',
      rateioCcPadrao: 'RAT-CC-01',
      grupo: 'Escritório',
      inativo: false,
    },
    {
      codigo: 'IT-2001',
      descricao: 'Notebook 14" 16GB RAM 512GB SSD',
      unidade: 'UN',
      contaContabilPadrao: '1.2.03.001',
      rateioFilialPadrao: 'RAT-FIL-01',
      rateioCcPadrao: 'RAT-CC-02',
      grupo: 'TI',
      inativo: false,
    },
    {
      codigo: 'IT-2002',
      descricao: 'Monitor 27" Full HD',
      unidade: 'UN',
      contaContabilPadrao: '1.2.03.001',
      rateioFilialPadrao: 'RAT-FIL-01',
      rateioCcPadrao: 'RAT-CC-02',
      grupo: 'TI',
      inativo: false,
    },
    {
      codigo: 'IT-3001',
      descricao: 'Detergente neutro 5L',
      unidade: 'GL',
      contaContabilPadrao: '4.1.02.001',
      rateioFilialPadrao: 'RAT-FIL-02',
      rateioCcPadrao: 'RAT-CC-03',
      grupo: 'Limpeza',
      inativo: false,
    },
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

  // Requisição DRAFT (operador pode submeter) — total 750
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
    requisitions: [reqDraft, reqAppr],
    approvalSteps: [stepGestor],
    purchaseOrders: [],
    fundRequests: [],
    fiscalItemRequests: [],
    notifications: [],
    integrationLogs: [],
    receivings: [],
  };
}
