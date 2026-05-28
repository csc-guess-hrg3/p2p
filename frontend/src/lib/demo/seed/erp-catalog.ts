/**
 * Dados de referência "ERP" do modo demo. Espelham as views `v_p2p_*`
 * do backend (estrutura mínima necessária para os fluxos demo).
 * Mantidos em arquivo próprio porque são estáticos e ocupariam ~125
 * linhas no seed principal sem agregar lógica.
 */

export interface DemoBranch {
  codigo: string;
  nome: string;
  razaoSocial?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  tipo?: string | null;
  inativo: boolean;
}

export interface DemoSupplier {
  codigo: string;
  nome: string;
  razaoSocial: string;
  cnpjCpf: string;
  email: string | null;
  telefone: string;
  condicaoPgto: string;
  inativo: boolean;
}

export interface DemoItem {
  codigo: string;
  descricao: string;
  unidade: string;
  contaContabilPadrao: string;
  rateioFilialPadrao: string;
  rateioCcPadrao: string;
  grupo: string;
  inativo: boolean;
}

export interface DemoAccount {
  codigo: string;
  nome: string;
  inativo: boolean;
}

export interface DemoPaymentCondition {
  codigo: string;
  descricao: string;
  tipo: string;
  parcelas: number;
}

export interface DemoRateio {
  codigo: string;
  descricao: string;
  inativo: boolean;
  linhas: Array<{
    filialCodigo: string;
    centroCustoCodigo?: string;
    porcentagem: number;
  }>;
}

export interface DemoComprasTipo {
  tipoCompra: string;
  aeDocumento: string;
}

export interface DemoCtbTipoOperacao {
  codigo: number;
  descricao: string;
}

export interface DemoNaturezaEntrada {
  codigo: string;
  descricao: string;
  ctbTipoOperacao: number;
}

export const branches: DemoBranch[] = [
  {
    codigo: 'FIL-01',
    nome: 'Matriz São Paulo',
    razaoSocial: 'HRG3 Indústria e Comércio S.A.',
    cnpj: '12.345.678/0001-90',
    ie: '123.456.789.012',
    logradouro: 'Av. Paulista',
    numero: '1000',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '01310-100',
    tipo: 'MATRIZ',
    inativo: false,
  },
  {
    codigo: 'FIL-02',
    nome: 'Filial Rio de Janeiro',
    razaoSocial: 'HRG3 Indústria e Comércio S.A.',
    cnpj: '12.345.678/0002-71',
    ie: '987.654.321.098',
    logradouro: 'Av. Rio Branco',
    numero: '200',
    bairro: 'Centro',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    cep: '20040-002',
    tipo: 'LOJA',
    inativo: false,
  },
  {
    codigo: 'FIL-03',
    nome: 'CD Campinas',
    razaoSocial: 'HRG3 Indústria e Comércio S.A.',
    cnpj: '12.345.678/0003-52',
    ie: '456.789.012.345',
    logradouro: 'Rod. Anhanguera, Km 100',
    numero: 's/n',
    bairro: 'Distrito Industrial',
    cidade: 'Campinas',
    uf: 'SP',
    cep: '13050-000',
    tipo: 'CD',
    inativo: false,
  },
];

export const suppliers: DemoSupplier[] = [
  { codigo: 'FOR-001', nome: 'Office Supplies Ltda', razaoSocial: 'Office Supplies Comercial Ltda', cnpjCpf: '12.345.678/0001-90', email: 'vendas@officesupplies.com.br', telefone: '(11) 3000-0001', condicaoPgto: '30', inativo: false },
  { codigo: 'FOR-002', nome: 'TechParts Distribuidora', razaoSocial: 'TechParts Distribuidora S/A', cnpjCpf: '98.765.432/0001-21', email: 'comercial@techparts.com.br', telefone: '(11) 3000-0002', condicaoPgto: '30/60', inativo: false },
  { codigo: 'FOR-003', nome: 'Limpeza Total', razaoSocial: 'Limpeza Total Higienização Ltda', cnpjCpf: '11.222.333/0001-44', email: null, telefone: '(11) 3000-0003', condicaoPgto: '15', inativo: false },
  { codigo: 'FOR-004', nome: 'Gráfica Sol Nascente', razaoSocial: 'Sol Nascente Gráfica e Editora Ltda', cnpjCpf: '22.333.444/0001-55', email: 'orcamento@solnascente.com.br', telefone: '(11) 3000-0004', condicaoPgto: '30', inativo: false },
  { codigo: 'FOR-005', nome: 'Café & Cia', razaoSocial: 'Café e Cia Distribuidora Ltda', cnpjCpf: '33.444.555/0001-66', email: 'pedidos@cafeecia.com.br', telefone: '(11) 3000-0005', condicaoPgto: '0', inativo: false },
  { codigo: 'FOR-006', nome: 'Consultoria Aprende+', razaoSocial: 'Aprende+ Consultoria Empresarial', cnpjCpf: '44.555.666/0001-77', email: 'contato@aprendemais.com.br', telefone: '(11) 3000-0006', condicaoPgto: '30/60/90', inativo: false },
  { codigo: 'FOR-007', nome: 'Manutenção Veloz', razaoSocial: 'Veloz Serviços de Manutenção Predial', cnpjCpf: '55.666.777/0001-88', email: 'comercial@manutencaoveloz.com.br', telefone: '(11) 3000-0007', condicaoPgto: '15', inativo: false },
  { codigo: 'FOR-008', nome: 'TransLog Express', razaoSocial: 'TransLog Express Transportes Ltda', cnpjCpf: '66.777.888/0001-99', email: 'frete@translog.com.br', telefone: '(11) 3000-0008', condicaoPgto: '30', inativo: false },
];

export const items: DemoItem[] = [
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

export const accounts: DemoAccount[] = [
  { codigo: '4.1.01.001', nome: 'Material de Escritório', inativo: false },
  { codigo: '4.1.02.001', nome: 'Material de Limpeza', inativo: false },
  { codigo: '1.2.03.001', nome: 'Imobilizado — Equipamentos TI', inativo: false },
  { codigo: '4.1.05.001', nome: 'Serviços de Terceiros', inativo: false },
];

export const paymentConditions: DemoPaymentCondition[] = [
  { codigo: '0', descricao: 'À vista', tipo: 'VISTA', parcelas: 1 },
  { codigo: '30', descricao: '30 dias', tipo: 'PRAZO', parcelas: 1 },
  { codigo: '30/60', descricao: '30/60 dias', tipo: 'PRAZO', parcelas: 2 },
  { codigo: '30/60/90', descricao: '30/60/90 dias', tipo: 'PRAZO', parcelas: 3 },
];

export const branchRateios: DemoRateio[] = [
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

export const ccRateios: DemoRateio[] = [
  {
    codigo: 'RAT-CC-01',
    descricao: 'CC Administrativo',
    inativo: false,
    linhas: [
      { filialCodigo: 'FIL-01', centroCustoCodigo: 'CC-1001', porcentagem: 100 },
    ],
  },
  {
    codigo: 'RAT-CC-02',
    descricao: 'CC TI',
    inativo: false,
    linhas: [
      { filialCodigo: 'FIL-01', centroCustoCodigo: 'CC-1002', porcentagem: 100 },
    ],
  },
  {
    codigo: 'RAT-CC-03',
    descricao: 'CC Manutenção',
    inativo: false,
    linhas: [
      { filialCodigo: 'FIL-01', centroCustoCodigo: 'CC-1003', porcentagem: 60 },
      { filialCodigo: 'FIL-02', centroCustoCodigo: 'CC-1003', porcentagem: 40 },
    ],
  },
];

export const comprasTipos: DemoComprasTipo[] = [
  { tipoCompra: 'COMPRA DIVERSAS', aeDocumento: 'AE-NF' },
  { tipoCompra: 'CONSULTORIA', aeDocumento: 'AE-NFS' },
  { tipoCompra: 'LOCAÇÃO', aeDocumento: 'AE-ND' },
];

export const ctbTipoOperacao: DemoCtbTipoOperacao[] = [
  { codigo: 202, descricao: 'Compra de Material de Consumo' },
  { codigo: 203, descricao: 'Aquisição de Imobilizado' },
  { codigo: 210, descricao: 'Contratação de Serviços' },
];

export const naturezasEntrada: DemoNaturezaEntrada[] = [
  { codigo: '202.01', descricao: 'Mat. Consumo - Escritório', ctbTipoOperacao: 202 },
  { codigo: '202.02', descricao: 'Mat. Consumo - Limpeza', ctbTipoOperacao: 202 },
  { codigo: '203.01', descricao: 'Imobilizado - Equipamentos TI', ctbTipoOperacao: 203 },
  { codigo: '210.01', descricao: 'Consultoria especializada', ctbTipoOperacao: 210 },
];
