/**
 * Handler demo do módulo Financeiro — Contas a Pagar, Provisões e DDAs.
 * Espelha o backend (`/financial/*`) com massa fictícia consistente:
 * fornecedores que já aparecem nos POs demo, valores plausíveis, mistura
 * de status (a vencer / vencido / pago, pendente / conciliado).
 */
import { ok, type DemoResponse } from './_shared';

const today = new Date();
const day = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

const CONTAS_PAGAR = [
  {
    empresa: 'GUESS',
    lancamento: 60281,
    item: 1,
    idParcela: 1,
    codClifor: '000123',
    nomeClifor: 'PETROBRAS DISTRIBUIDORA',
    razaoSocial: 'PETROBRAS DISTRIBUIDORA S.A.',
    cnpjCpf: '33.000.167/0001-01',
    fatura: 'NF-78421',
    emissao: day(-15),
    vencimento: day(15),
    vencimentoReal: day(15),
    valorOriginal: 12500.5,
    valorAPagar: 12500.5,
    saldoDevido: 12500.5,
    totalPago: 0,
    posicao: 'A VENCER',
    tipoLancamento: 'ITP',
    statusConciliacao: 'PEND',
    conciliadoDda: 'N',
    codFilial: '01',
    razaoFilial: 'MATRIZ',
    contaContabil: '2.1.01.001',
  },
  {
    empresa: 'GUESS',
    lancamento: 60272,
    item: 1,
    idParcela: 1,
    codClifor: '000456',
    nomeClifor: 'CIA DE BEBIDAS DAS AMERICAS',
    razaoSocial: 'AMBEV S.A.',
    cnpjCpf: '07.526.557/0001-00',
    fatura: 'NF-99102',
    emissao: day(-45),
    vencimento: day(-5),
    vencimentoReal: day(-5),
    valorOriginal: 3450.0,
    valorAPagar: 3450.0,
    saldoDevido: 3450.0,
    totalPago: 0,
    posicao: 'VENCIDO',
    tipoLancamento: 'ITP',
    statusConciliacao: 'FD',
    conciliadoDda: 'S',
    codFilial: '01',
    razaoFilial: 'MATRIZ',
    contaContabil: '2.1.01.001',
  },
  {
    empresa: 'GUESS',
    lancamento: 60219,
    item: 2,
    idParcela: 1,
    codClifor: '000789',
    nomeClifor: 'CEMIG DISTRIBUICAO',
    razaoSocial: 'CEMIG DISTRIBUICAO S.A.',
    cnpjCpf: '06.981.180/0001-16',
    fatura: 'CONTA-MAR/24',
    emissao: day(-60),
    vencimento: day(-30),
    vencimentoReal: day(-30),
    valorOriginal: 1820.75,
    valorAPagar: 1820.75,
    saldoDevido: 0,
    totalPago: 1820.75,
    posicao: 'PAGO',
    tipoLancamento: 'ITP',
    statusConciliacao: 'OK',
    conciliadoDda: 'S',
    codFilial: '01',
    razaoFilial: 'MATRIZ',
    contaContabil: '2.1.01.002',
  },
  {
    empresa: 'GUESS',
    lancamento: 60285,
    item: 1,
    idParcela: 1,
    codClifor: '000321',
    nomeClifor: 'SODEXO DO BRASIL',
    razaoSocial: 'SODEXO PASS DO BRASIL S.A.',
    cnpjCpf: '69.034.668/0001-56',
    fatura: 'BENEF-04/24',
    emissao: day(-10),
    vencimento: day(20),
    vencimentoReal: day(20),
    valorOriginal: 8900.0,
    valorAPagar: 8900.0,
    saldoDevido: 8900.0,
    totalPago: 0,
    posicao: 'A VENCER',
    tipoLancamento: 'ITP',
    statusConciliacao: 'PEND',
    conciliadoDda: 'N',
    codFilial: '02',
    razaoFilial: 'FILIAL RJ',
    contaContabil: '2.1.01.005',
  },
  {
    empresa: 'GUESS',
    lancamento: 60195,
    item: 1,
    idParcela: 2,
    codClifor: '000901',
    nomeClifor: 'TELEFONICA BRASIL',
    razaoSocial: 'TELEFONICA BRASIL S.A.',
    cnpjCpf: '02.558.157/0001-62',
    fatura: 'NF-44520',
    emissao: day(-90),
    vencimento: day(-65),
    vencimentoReal: day(-65),
    valorOriginal: 540.2,
    valorAPagar: 540.2,
    saldoDevido: 540.2,
    totalPago: 0,
    posicao: 'VENCIDO',
    tipoLancamento: 'ITP',
    statusConciliacao: 'FD',
    conciliadoDda: 'N',
    codFilial: '01',
    razaoFilial: 'MATRIZ',
    contaContabil: '2.1.01.003',
  },
];

const PROVISOES_SV = [
  {
    tipo: 'SV',
    id: 67251,
    emitente: 'TIFANY PORTO',
    emissao: day(-7),
    codClifor: '000123',
    nomeClifor: 'JOAO DA SILVA',
    contaContabil: '1.1.02.005',
    descItem: 'Adiantamento viagem São Paulo — feira NRF',
    ctbFilial: '01',
    ctbCentroCusto: '301',
    idParcela: 1,
    moeda: 'R$',
    valorOriginal: 4500.0,
    valorEntregar: 4500.0,
    vencimento: day(3),
    vencimentoReal: day(3),
    codFilial: '01',
    obs: 'Aguardando IAD',
    statusAprovacao: 'APROVADO',
  },
  {
    tipo: 'SV',
    id: 67248,
    emitente: 'CARLOS GESTOR',
    emissao: day(-14),
    codClifor: '000456',
    nomeClifor: 'LOJAS FORTALEZA LTDA',
    contaContabil: '1.1.02.005',
    descItem: 'Reposição de caixa filial 04 — semana 18',
    ctbFilial: '04',
    ctbCentroCusto: '402',
    idParcela: 1,
    moeda: 'R$',
    valorOriginal: 12000.0,
    valorEntregar: 7500.0,
    vencimento: day(-2),
    vencimentoReal: day(-2),
    codFilial: '04',
    obs: 'IAD parcial gerado em 20/05',
    statusAprovacao: 'APROVADO',
  },
  {
    tipo: 'SV',
    id: 67255,
    emitente: 'OPERADOR DEMO',
    emissao: day(-2),
    codClifor: '000901',
    nomeClifor: 'EVENTOS PRO LTDA',
    contaContabil: '1.1.02.006',
    descItem: 'Sinal evento integração equipe Q2',
    ctbFilial: '01',
    ctbCentroCusto: '101',
    idParcela: 1,
    moeda: 'R$',
    valorOriginal: 9800.0,
    valorEntregar: 9800.0,
    vencimento: day(8),
    vencimentoReal: day(8),
    codFilial: '01',
    obs: '',
    statusAprovacao: 'PENDENTE',
  },
];

const IADS = [
  {
    empresa: 1,
    lancamento: 1048193,
    item: 1,
    tipoLancamento: 'IAD',
    codClifor: '000222',
    nomeClifor: 'VEXPENSES S A',
    razaoSocial: 'VEXPENSES TECNOLOGIA S.A.',
    cnpjCpf: '21.471.589/0001-23',
    emissao: day(-1),
    vencimento: day(28),
    vencimentoReal: day(28),
    valorOriginal: 21107.89,
    valorAviso: 21107.89,
    valorPago: 0,
    saldoAberto: 21107.89,
    posicao: 'A VENCER',
    contaContabil: '1.1.03.2.009',
    descConta: 'ADIANTAMENTOS A FORNECEDORES',
    rateioCentroCusto: '301',
    rateioFilial: '01',
    pedidoOrigem: null,
    statusAprovacao: 'A',
    descAviso: 'RECARGA VEXPENSES',
    solicitacaoVerba: 67250,
    solicitacaoVerbaItem: '0001',
  },
  {
    empresa: 1,
    lancamento: 1047193,
    item: 35,
    tipoLancamento: 'IAD',
    codClifor: '000334',
    nomeClifor: 'BANCO SANTANDER',
    razaoSocial: 'BANCO SANTANDER S.A.',
    cnpjCpf: '90.400.888/0001-42',
    emissao: day(-4),
    vencimento: day(25),
    vencimentoReal: day(25),
    valorOriginal: 14360.33,
    valorAviso: 14360.33,
    valorPago: 0,
    saldoAberto: 14360.33,
    posicao: 'A VENCER',
    contaContabil: '1.1.03.2.009',
    descConta: 'ADIANTAMENTOS A FORNECEDORES',
    rateioCentroCusto: '101',
    rateioFilial: '01',
    pedidoOrigem: null,
    statusAprovacao: 'A',
    descAviso: 'FAT 510124004 CARTAO CORPORATIVO SANTANDER',
    solicitacaoVerba: null,
    solicitacaoVerbaItem: null,
  },
  {
    empresa: 1,
    lancamento: 1047170,
    item: 2,
    tipoLancamento: 'IAD',
    codClifor: '000111',
    nomeClifor: 'FOPAG',
    razaoSocial: 'FOPAG ADIANTAMENTOS',
    cnpjCpf: '11.111.111/0001-11',
    emissao: day(-4),
    vencimento: day(25),
    vencimentoReal: day(25),
    valorOriginal: 119.9,
    valorAviso: 119.9,
    valorPago: 0,
    saldoAberto: 119.9,
    posicao: 'A VENCER',
    contaContabil: '1.1.03.2.009',
    descConta: 'ADIANTAMENTOS A FORNECEDORES',
    rateioCentroCusto: '201',
    rateioFilial: '02',
    pedidoOrigem: null,
    statusAprovacao: 'A',
    descAviso: 'GFD SSA',
    solicitacaoVerba: 67248,
    solicitacaoVerbaItem: '0001',
  },
  {
    empresa: 1,
    lancamento: 1047630,
    item: 21,
    tipoLancamento: 'IAD',
    codClifor: '000999',
    nomeClifor: 'CD - ECOMMERCE',
    razaoSocial: 'CENTRO DE DISTRIBUICAO ECOMMERCE LTDA',
    cnpjCpf: '99.999.999/0001-99',
    emissao: day(-5),
    vencimento: day(-5),
    vencimentoReal: day(-5),
    valorOriginal: 657.0,
    valorAviso: 657.0,
    valorPago: 0,
    saldoAberto: 657.0,
    posicao: 'VENCIDOS',
    contaContabil: '1.1.03.2.009',
    descConta: 'ADIANTAMENTOS A FORNECEDORES',
    rateioCentroCusto: '402',
    rateioFilial: '04',
    pedidoOrigem: '-154069',
    statusAprovacao: 'A',
    descAviso: 'CREDITO REFERENTE AO PEDIDO: -154069',
    solicitacaoVerba: null,
    solicitacaoVerbaItem: null,
  },
];

const DDAS = [
  {
    idArquivo: 4521,
    itemArquivo: 1,
    nomeArquivo: 'DDA_20240520.RET',
    dataRecebimento: day(-1),
    lancamento: null,
    item: null,
    duplicata: '99110-1',
    emissao: day(-3),
    vencimento: day(10),
    valorTitulo: 3450.0,
    contaCorrente: '0001-12345-6',
    layout: '240',
    descLayout: 'RETORNO TITULOS DDA',
    tipoConciliacao: 'AUTO',
    statusConciliacao: 'PEND',
    descStatus: 'AGUARDANDO ENTRADA NF',
    codClifor: '000456',
    cnpj: '07.526.557/0001-00',
    razaoSocial: 'AMBEV S.A.',
    codFilial: '01',
    cnpjFilial: '07.000.000/0001-00',
    codigoBarra: '00190000090331100100000000000123456789012345',
    ultMovimento: day(-1),
  },
  {
    idArquivo: 4520,
    itemArquivo: 3,
    nomeArquivo: 'DDA_20240519.RET',
    dataRecebimento: day(-2),
    lancamento: 60281,
    item: 1,
    duplicata: '78421',
    emissao: day(-15),
    vencimento: day(15),
    valorTitulo: 12500.5,
    contaCorrente: '0001-12345-6',
    layout: '240',
    descLayout: 'RETORNO TITULOS DDA',
    tipoConciliacao: 'AUTO',
    statusConciliacao: 'OK',
    descStatus: 'TITULO CONCILIADO',
    codClifor: '000123',
    cnpj: '33.000.167/0001-01',
    razaoSocial: 'PETROBRAS DISTRIBUIDORA S.A.',
    codFilial: '01',
    cnpjFilial: '07.000.000/0001-00',
    codigoBarra: '00190000090125005000000000000784210000000000',
    ultMovimento: day(-2),
  },
  {
    idArquivo: 4519,
    itemArquivo: 1,
    nomeArquivo: 'DDA_20240518.RET',
    dataRecebimento: day(-3),
    lancamento: null,
    item: null,
    duplicata: 'BOL-7788',
    emissao: day(-4),
    vencimento: day(7),
    valorTitulo: 2100.0,
    contaCorrente: '0001-12345-6',
    layout: '240',
    descLayout: 'RETORNO TITULOS DDA',
    tipoConciliacao: 'MANUAL',
    statusConciliacao: 'PEND',
    descStatus: 'AGUARDANDO ENTRADA NF',
    codClifor: null,
    cnpj: '11.222.333/0001-44',
    razaoSocial: 'FORNECEDOR NAO CADASTRADO',
    codFilial: '01',
    cnpjFilial: '07.000.000/0001-00',
    codigoBarra: '00190000090021000000000000000077880000000000',
    ultMovimento: day(-3),
  },
];

// ─── Geração programática de mais entradas pra encher as telas ────
// Mantemos os primeiros itens hardcoded (acima) como "referência" do
// dataset e adicionamos 20+ por categoria com fornecedores, contas,
// filiais e datas variadas. Tudo determinístico (sem Math.random)
// pra reload sempre devolver os mesmos números.

const EXTRA_FORNECEDORES = [
  { cod: '000150', nome: 'EMBRAER S.A.', razao: 'EMBRAER S.A.', cnpj: '07.689.002/0001-89', conta: '2.1.01.001' },
  { cod: '000180', nome: 'ALGAR TELECOM', razao: 'ALGAR TELECOM S/A', cnpj: '71.208.516/0001-74', conta: '4.1.03.001' },
  { cod: '000201', nome: 'COCA COLA INDUSTRIAS', razao: 'RECOFARMA INDUSTRIA DO AMAZONAS LTDA', cnpj: '34.351.616/0001-30', conta: '2.1.01.001' },
  { cod: '000245', nome: 'GERDAU AÇOS', razao: 'GERDAU S.A.', cnpj: '33.611.500/0001-19', conta: '2.1.01.001' },
  { cod: '000288', nome: 'MICROSOFT BRASIL', razao: 'MICROSOFT INFORMATICA LTDA', cnpj: '60.316.817/0001-03', conta: '4.1.04.001' },
  { cod: '000310', nome: 'WHITE MARTINS GASES', razao: 'WHITE MARTINS GASES INDUSTRIAIS LTDA', cnpj: '35.820.448/0001-90', conta: '4.1.02.001' },
  { cod: '000335', nome: 'KIMBERLY CLARK', razao: 'KIMBERLY CLARK BRASIL INDUSTRIA E COMERCIO', cnpj: '53.116.155/0001-43', conta: '4.1.02.001' },
  { cod: '000401', nome: 'TIM CELULAR', razao: 'TIM S.A.', cnpj: '02.421.421/0001-11', conta: '4.1.03.001' },
  { cod: '000455', nome: 'ECT — CORREIOS', razao: 'EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS', cnpj: '34.028.316/0001-03', conta: '4.1.03.002' },
  { cod: '000489', nome: 'TOTVS S.A.', razao: 'TOTVS S.A.', cnpj: '53.113.791/0001-22', conta: '4.1.04.001' },
  { cod: '000512', nome: 'NESTLÉ BRASIL', razao: 'NESTLE BRASIL LTDA', cnpj: '60.409.075/0001-52', conta: '2.1.01.001' },
  { cod: '000534', nome: 'AMERICAN EXPRESS', razao: 'AMERICAN EXPRESS DO BRASIL S.A.', cnpj: '61.227.239/0001-30', conta: '4.1.05.001' },
  { cod: '000567', nome: 'SAP BRASIL', razao: 'SAP BRASIL LTDA', cnpj: '03.788.116/0001-08', conta: '4.1.04.001' },
  { cod: '000601', nome: 'GOOGLE BRASIL', razao: 'GOOGLE BRASIL INTERNET LTDA', cnpj: '06.990.590/0001-23', conta: '4.1.04.001' },
  { cod: '000644', nome: 'TIM SERVIÇOS', razao: 'TIM S.A.', cnpj: '02.421.421/0001-11', conta: '4.1.03.001' },
  { cod: '000678', nome: 'CLARO S/A', razao: 'CLARO S.A.', cnpj: '40.432.544/0001-47', conta: '4.1.03.001' },
  { cod: '000712', nome: 'IBM BRASIL', razao: 'IBM BRASIL — INDUSTRIA, MAQUINAS E SERVICOS', cnpj: '33.372.251/0001-56', conta: '4.1.04.001' },
  { cod: '000756', nome: 'TRANSP RODOVIARIO BRAVO', razao: 'BRAVO TRANSPORTES LTDA', cnpj: '14.222.333/0001-77', conta: '4.1.03.003' },
  { cod: '000789', nome: 'CEMIG DISTRIBUICAO', razao: 'CEMIG DISTRIBUICAO S.A.', cnpj: '06.981.180/0001-16', conta: '4.1.02.002' },
  { cod: '000845', nome: 'COPEL DISTRIBUICAO', razao: 'COMPANHIA PARANAENSE DE ENERGIA', cnpj: '04.368.898/0001-06', conta: '4.1.02.002' },
];

const FILIAIS_FIN = [
  { cod: '01', razao: 'MATRIZ' },
  { cod: '02', razao: 'FILIAL RJ' },
  { cod: '03', razao: 'CD CAMPINAS' },
  { cod: '04', razao: 'FILIAL FORTALEZA' },
  { cod: '05', razao: 'FILIAL POA' },
];

// ── Contas a Pagar (ITP) gerados ─────────────────────────────────
EXTRA_FORNECEDORES.forEach((f, i) => {
  const filial = FILIAIS_FIN[i % FILIAIS_FIN.length];
  // Distribui valores entre 850 e 24000
  const valor = 850 + ((i * 1133) % 23150);
  // Algumas duplicatas/parcelas por fornecedor pra simular agrupamento
  const parcelas = [1, 2, 3].slice(0, 1 + (i % 3));
  parcelas.forEach((parc, pi) => {
    const venc = -45 + i * 4 + pi * 30;
    const totalPago = i % 5 === 4 ? valor : i % 4 === 3 ? valor * 0.6 : 0;
    const saldo = valor - totalPago;
    const posicao =
      saldo === 0
        ? 'PAGO'
        : venc < 0
          ? 'VENCIDO'
          : 'A VENCER';
    CONTAS_PAGAR.push({
      empresa: 'GUESS',
      lancamento: 70000 + i * 10 + pi,
      item: 1,
      idParcela: parc,
      codClifor: f.cod,
      nomeClifor: f.nome,
      razaoSocial: f.razao,
      cnpjCpf: f.cnpj,
      fatura: `NF-${10000 + i * 13 + pi}`,
      emissao: day(-30 + i),
      vencimento: day(venc),
      vencimentoReal: day(venc),
      valorOriginal: Number(valor.toFixed(2)),
      valorAPagar: Number(valor.toFixed(2)),
      saldoDevido: Number(saldo.toFixed(2)),
      totalPago: Number(totalPago.toFixed(2)),
      posicao,
      tipoLancamento: 'ITP',
      statusConciliacao: posicao === 'PAGO' ? 'OK' : posicao === 'VENCIDO' ? 'FD' : 'PEND',
      conciliadoDda: i % 3 === 0 ? 'S' : 'N',
      codFilial: filial.cod,
      razaoFilial: filial.razao,
      contaContabil: f.conta,
    });
  });
});

// ── Provisões SV geradas ─────────────────────────────────────────
EXTRA_FORNECEDORES.slice(0, 15).forEach((f, i) => {
  const valor = 1200 + ((i * 837) % 18000);
  const entregar = i % 4 === 3 ? Number((valor * 0.4).toFixed(2)) : valor;
  PROVISOES_SV.push({
    tipo: 'SV',
    id: 67300 + i,
    emitente:
      i % 3 === 0
        ? 'TIFANY PORTO'
        : i % 3 === 1
          ? 'CARLOS GESTOR'
          : 'OPERADOR DEMO',
    emissao: day(-i * 3 - 1),
    codClifor: f.cod,
    nomeClifor: f.nome,
    contaContabil: '1.1.02.005',
    descItem:
      i % 3 === 0
        ? `Adiantamento para ${f.nome}`
        : i % 3 === 1
          ? `Sinal contrato ${f.nome}`
          : `Reposição de caixa filial ${(i % 5) + 1}`,
    ctbFilial: FILIAIS_FIN[i % FILIAIS_FIN.length].cod,
    ctbCentroCusto: ['101', '201', '301', '402'][i % 4],
    idParcela: 1,
    moeda: 'R$',
    valorOriginal: Number(valor.toFixed(2)),
    valorEntregar: Number(entregar.toFixed(2)),
    vencimento: day(i * 2 - 6),
    vencimentoReal: day(i * 2 - 6),
    codFilial: FILIAIS_FIN[i % FILIAIS_FIN.length].cod,
    obs: i % 4 === 3 ? 'IAD parcial gerado.' : '',
    statusAprovacao: i % 7 === 6 ? 'PENDENTE' : 'APROVADO',
  });
});

// ── IADs gerados ─────────────────────────────────────────────────
EXTRA_FORNECEDORES.slice(0, 18).forEach((f, i) => {
  const valor = 850 + ((i * 1283) % 23150);
  const venc = -20 + i * 5;
  const saldo = i % 6 === 5 ? 0 : valor;
  IADS.push({
    empresa: 1,
    lancamento: 1100000 + i,
    item: 1 + (i % 30),
    tipoLancamento: 'IAD',
    codClifor: f.cod,
    nomeClifor: f.nome,
    razaoSocial: f.razao,
    cnpjCpf: f.cnpj,
    emissao: day(-15 + i),
    vencimento: day(venc),
    vencimentoReal: day(venc),
    valorOriginal: Number(valor.toFixed(2)),
    valorAviso: Number(valor.toFixed(2)),
    valorPago: Number((valor - saldo).toFixed(2)),
    saldoAberto: Number(saldo.toFixed(2)),
    posicao: saldo === 0 ? 'BAIXADO' : venc < 0 ? 'VENCIDOS' : 'A VENCER',
    contaContabil: '1.1.03.2.009',
    descConta: 'ADIANTAMENTOS A FORNECEDORES',
    rateioCentroCusto: ['101', '201', '301', '402'][i % 4],
    rateioFilial: FILIAIS_FIN[i % FILIAIS_FIN.length].cod,
    pedidoOrigem: i % 3 === 0 ? `OC-2026-${String(100 + i).padStart(6, '0')}` : null,
    statusAprovacao: 'A',
    descAviso: `Adiantamento ${f.nome}`,
    solicitacaoVerba: i % 4 === 0 ? 67300 + i : null,
    solicitacaoVerbaItem: i % 4 === 0 ? '0001' : null,
  });
});

// ── DDAs gerados ─────────────────────────────────────────────────
EXTRA_FORNECEDORES.slice(0, 22).forEach((f, i) => {
  const valor = 480 + ((i * 829) % 19500);
  const vencOffset = -10 + i * 2;
  const baixado = i % 4 === 0;
  DDAS.push({
    idArquivo: 4530 + i,
    itemArquivo: 1 + (i % 5),
    nomeArquivo: `DDA_2024${String(5 + (i % 7)).padStart(2, '0')}${String(10 + i).padStart(2, '0')}.RET`,
    dataRecebimento: day(-i),
    lancamento: i % 5 === 0 ? 60000 + i * 11 : null,
    item: i % 5 === 0 ? 1 : null,
    duplicata: `DUP-${10000 + i * 7}`,
    emissao: day(-i - 5),
    vencimento: day(vencOffset),
    valorTitulo: Number(valor.toFixed(2)),
    contaCorrente: ['0001-12345-6', '0001-67890-1', '0002-11111-2'][i % 3],
    layout: '240',
    descLayout: 'RETORNO TITULOS DDA',
    tipoConciliacao: i % 3 === 0 ? 'MANUAL' : 'AUTO',
    statusConciliacao: baixado ? 'OK' : 'PEND',
    descStatus: baixado ? 'TITULO CONCILIADO' : 'AGUARDANDO ENTRADA NF',
    codClifor: i % 3 === 2 ? null : f.cod,
    cnpj: f.cnpj,
    razaoSocial: i % 3 === 2 ? 'FORNECEDOR NAO CADASTRADO' : f.razao,
    codFilial: FILIAIS_FIN[i % FILIAIS_FIN.length].cod,
    cnpjFilial: '07.000.000/0001-00',
    codigoBarra: `00190000090${String(10000 + i * 17).padStart(13, '0')}${String(i * 11).padStart(20, '0')}`,
    ultMovimento: day(-i),
  });
});

function isVencido(r: (typeof CONTAS_PAGAR)[number]): boolean {
  return Number(r.saldoDevido) > 0 && r.vencimentoReal < new Date().toISOString();
}

export function handleFinancial(
  method: string,
  segments: string[],
  query: Record<string, string>,
): DemoResponse | null {
  if (method !== 'GET') return null;
  const sub = segments[1];

  const limit = Math.min(Number(query.limit ?? 50), 500);
  const offset = Math.max(Number(query.offset ?? 0), 0);

  if (sub === 'contas-pagar') {
    let items = [...CONTAS_PAGAR].map((r) => ({ ...r, qtdParcelas: 1 }));
    if (query.status === 'A_VENCER') {
      items = items.filter(
        (r) => Number(r.saldoDevido) > 0 && !isVencido(r),
      );
    } else if (query.status === 'VENCIDO') {
      items = items.filter(isVencido);
    } else if (query.status === 'PAGO') {
      items = items.filter((r) => Number(r.saldoDevido) <= 0);
    }
    const search = (query.search ?? '').toLowerCase();
    if (search) {
      items = items.filter((r) =>
        [r.nomeClifor, r.razaoSocial, r.fatura, r.cnpjCpf]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }
    return ok({ items: items.slice(offset, offset + limit), limit, offset });
  }

  if (sub === 'provisoes') {
    const tipo = (query.tipo ?? 'SV').toUpperCase();
    // Só temos SV no mock — IAD/ITP ficam vazias até o usuário gerar.
    const items = tipo === 'SV' ? PROVISOES_SV : [];
    return ok({ items: items.slice(offset, offset + limit), limit, offset });
  }

  if (sub === 'suppliers') {
    const items = [
      { code: '000123', name: 'PETROBRAS DISTRIBUIDORA', razaoSocial: 'PETROBRAS DISTRIBUIDORA S.A.', cnpj: '33.000.167/0001-01' },
      { code: '000456', name: 'CIA DE BEBIDAS DAS AMERICAS', razaoSocial: 'AMBEV S.A.', cnpj: '07.526.557/0001-00' },
      { code: '000789', name: 'CEMIG DISTRIBUICAO', razaoSocial: 'CEMIG DISTRIBUICAO S.A.', cnpj: '06.981.180/0001-16' },
      { code: '000321', name: 'SODEXO DO BRASIL', razaoSocial: 'SODEXO PASS DO BRASIL S.A.', cnpj: '69.034.668/0001-56' },
      { code: '000901', name: 'TELEFONICA BRASIL', razaoSocial: 'TELEFONICA BRASIL S.A.', cnpj: '02.558.157/0001-62' },
      { code: '000222', name: 'VEXPENSES S A', razaoSocial: 'VEXPENSES TECNOLOGIA S.A.', cnpj: '21.471.589/0001-23' },
    ];
    const search = (query.search ?? '').toLowerCase();
    const filtered = search
      ? items.filter((i) =>
          [i.name, i.razaoSocial, i.cnpj].some((v) =>
            v.toLowerCase().includes(search),
          ),
        )
      : items;
    return ok(filtered);
  }

  if (sub === 'contas-pagar' && segments[2] === 'documentos') {
    // Reaproveita CONTAS_PAGAR consolidando por LANCAMENTO sintético.
    const items = CONTAS_PAGAR.map((r) => ({
      lancamento: r.lancamento,
      codClifor: r.codClifor,
      nomeClifor: r.nomeClifor,
      razaoSocial: r.razaoSocial,
      cnpjCpf: r.cnpjCpf,
      fatura: r.fatura,
      emissao: r.emissao,
      vencimentoReal: r.vencimentoReal,
      valorOriginal: r.valorOriginal,
      saldoDevido: r.saldoDevido,
      totalPago: r.totalPago,
      posicao: r.posicao,
      codFilial: r.codFilial,
      razaoFilial: r.razaoFilial,
      qtdItens: 1,
      qtdParcelas: 1,
    }));
    return ok({ items, limit, offset });
  }

  if (sub === 'contas-pagar' && segments[2] === 'itens') {
    const lcto = Number(query.lancamento ?? 0);
    return ok({
      items: [
        {
          item: 1,
          fatura: `${lcto}-NF`,
          contaContabil: '2.1.01.001',
          descConta: 'FORNECEDORES NACIONAIS',
          nomeClifor: 'Fornecedor exemplo',
          valorOriginal: 1000,
          saldoDevido: 1000,
          qtdParcelas: 1,
        },
        {
          item: 3,
          fatura: `${lcto}-IRRF`,
          contaContabil: '2.1.02.007',
          descConta: 'IRRF TERCEIROS',
          nomeClifor: 'União Federal',
          valorOriginal: 15,
          saldoDevido: 15,
          qtdParcelas: 1,
        },
        {
          item: 4,
          fatura: `${lcto}-PCC`,
          contaContabil: '2.1.02.008',
          descConta: 'PIS/COFINS/CSLL TERCEIROS',
          nomeClifor: 'União Federal',
          valorOriginal: 46,
          saldoDevido: 46,
          qtdParcelas: 1,
        },
      ],
    });
  }

  if (sub === 'contas-pagar' && segments[2] === 'parcelas') {
    const lcto = Number(query.lancamento ?? 0);
    return ok({
      items: [
        {
          idParcela: 'A',
          vencimento: day(15),
          vencimentoReal: day(15),
          valorOriginal: 4000,
          valorAPagar: 4000,
          saldoDevido: 4000,
          totalPago: 0,
          posicao: 'A VENCER',
          banco: '237',
          numeroBancario: `${lcto}-A`,
          statusConciliacao: 'PEND',
          conciliadoDda: false,
        },
        {
          idParcela: 'B',
          vencimento: day(45),
          vencimentoReal: day(45),
          valorOriginal: 4000,
          valorAPagar: 4000,
          saldoDevido: 4000,
          totalPago: 0,
          posicao: 'A VENCER',
          banco: '237',
          numeroBancario: `${lcto}-B`,
          statusConciliacao: 'PEND',
          conciliadoDda: false,
        },
      ],
    });
  }

  if (sub === 'currencies') {
    return ok([
      { code: 'R$', name: 'Real', isDefault: true },
      { code: 'US$', name: 'Dólar', isDefault: false },
      { code: 'EUR', name: 'Euro', isDefault: false },
    ]);
  }

  if (sub === 'branches') {
    return ok([
      { code: '01', name: 'MATRIZ' },
      { code: '02', name: 'FILIAL RJ' },
      { code: '04', name: 'CD - ECOMMERCE' },
      { code: '05', name: 'CD - ENTRADA' },
    ]);
  }
  if (sub === 'cost-centers') {
    return ok([
      { code: '101', name: 'ADMINISTRATIVO' },
      { code: '201', name: 'COMERCIAL' },
      { code: '301', name: 'MARKETING' },
      { code: '402', name: 'LOGÍSTICA' },
      { code: '501', name: 'TI' },
    ]);
  }

  if (sub === 'sv-saldos') {
    // Devolve saldos sintéticos pra qualquer SV pedida — alguns abertos,
    // outros zerados pra simular SVs realizadas. Determinístico por número.
    const svs = (query.svs ?? '').split(',').filter(Boolean);
    const saldos: Record<string, unknown> = {};
    for (const sv of svs) {
      // SV ímpar = totalmente realizada (saldo 0); par = saldo aberto
      const n = Number(sv) || 0;
      const realizada = n % 2 === 1;
      const valorTotal = 1000 + (n % 10) * 500;
      saldos[sv] = {
        svNumber: sv,
        totalSolicitado: valorTotal,
        totalAPagar: realizada ? 0 : -valorTotal,
        itens: [
          {
            idItem: '0001',
            valorSolicitado: valorTotal,
            valorAPagar: realizada ? 0 : -valorTotal,
            valorAPagarCalc: realizada ? 0 : -valorTotal,
            vencimentoReal: day(10),
          },
        ],
      };
    }
    return ok({ saldos });
  }

  if (sub === 'iads') {
    let items = [...IADS];
    if (query.status === 'VENCIDO') {
      items = items.filter((r) => r.vencimentoReal < new Date().toISOString());
    } else if (query.status === 'A_VENCER') {
      items = items.filter((r) => r.vencimentoReal >= new Date().toISOString());
    }
    const search = (query.search ?? '').toLowerCase();
    if (search) {
      items = items.filter((r) =>
        [r.nomeClifor, r.razaoSocial, r.cnpjCpf, r.descAviso]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }
    return ok({ items: items.slice(offset, offset + limit), limit, offset });
  }

  if (sub === 'ddas') {
    // Mock: usa statusConciliacao 'PEND' como pendente (mapa pro código
    // 0 do Linx) e 'OK' como baixado (mapa pro código 8).
    let items = [...DDAS];
    if (query.status === 'PENDENTE') {
      items = items.filter((d) => d.statusConciliacao === 'PEND');
    } else if (query.status === 'BAIXADO') {
      items = items.filter((d) => d.statusConciliacao !== 'PEND');
    }
    return ok({ items: items.slice(offset, offset + limit), limit, offset });
  }

  return null;
}
