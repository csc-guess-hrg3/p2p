import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Row de Contas a Pagar — projeção da view W_CTB_A_PAGAR_PARCELA. */
export interface ContaPagarRow {
  empresa: string;
  lancamento: number | string;
  item: number | string;
  idParcela: number | string;
  codClifor: string | null;
  nomeClifor: string | null;
  razaoSocial: string | null;
  cnpjCpf: string | null;
  fatura: string | null;
  emissao: string | null;
  vencimento: string | null;
  vencimentoReal: string | null;
  valorOriginal: number | string;
  valorAPagar: number | string;
  saldoDevido: number | string;
  totalPago: number | string;
  posicao: string | null;
  tipoLancamento: string | null;
  statusConciliacao: string | null;
  descStatusConciliacao: string | null;
  conciliadoDda: string | null;
  codFilial: string | null;
  razaoFilial: string | null;
  contaContabil: string | null;
  /** Quando vem do modo agrupado, indica quantas parcelas o título tem. */
  qtdParcelas?: number;
  /** Em modo agrupado idParcela vem null (consolidado). */
}

/** Row de IAD — projeção de W_CTB_AVISO_LANCAMENTO + saldo. */
export interface IadRow {
  empresa: number;
  lancamento: number | string;
  item: number | string;
  tipoLancamento: string;
  codClifor: string | null;
  nomeClifor: string | null;
  razaoSocial: string | null;
  cnpjCpf: string | null;
  emissao: string | null;
  vencimento: string | null;
  vencimentoReal: string | null;
  valorOriginal: number | string;
  valorAviso: number | string;
  valorPago: number | string;
  saldoAberto: number | string;
  posicao: string | null;
  contaContabil: string | null;
  descConta: string | null;
  rateioCentroCusto: string | null;
  rateioFilial: string | null;
  pedidoOrigem: string | null;
  statusAprovacao: string | null;
  descAviso: string | null;
  /** SV de origem (preenchido quando o IAD veio de uma Solicitação de Verba). */
  solicitacaoVerba: number | string | null;
  solicitacaoVerbaItem: string | null;
}

/** Row de Provisão — projeção da view W_HRG3_CONTAS_PAGAR_PROVISAO. */
export interface ProvisaoRow {
  tipo: string;
  id: number | string;
  emitente: string | null;
  emissao: string | null;
  codClifor: string | null;
  nomeClifor: string | null;
  contaContabil: string | null;
  descItem: string | null;
  ctbFilial: string | null;
  ctbCentroCusto: string | null;
  idParcela: number | string | null;
  moeda: string | null;
  valorOriginal: number | string;
  valorEntregar: number | string;
  vencimento: string | null;
  vencimentoReal: string | null;
  codFilial: string | null;
  obs: string | null;
  statusAprovacao: string | null;
}

/** Row de DDA — projeção da view W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO. */
export interface DdaRow {
  idArquivo: number | string;
  itemArquivo: number | string;
  nomeArquivo: string | null;
  dataRecebimento: string | null;
  lancamento: number | string | null;
  item: number | string | null;
  duplicata: string | null;
  emissao: string | null;
  vencimento: string | null;
  valorTitulo: number | string;
  contaCorrente: string | null;
  layout: string | null;
  descLayout: string | null;
  tipoConciliacao: string | null;
  statusConciliacao: string | null;
  descStatus: string | null;
  codClifor: string | null;
  cnpj: string | null;
  razaoSocial: string | null;
  codFilial: string | null;
  cnpjFilial: string | null;
  codigoBarra: string | null;
  ultMovimento: string | null;
  qtdMovimentos?: number;
}

interface ListResponse<T> {
  items: T[];
  limit: number;
  offset: number;
}

/** Filtros comuns que toda listagem financeira aceita. */
export interface FinancialBaseFilters {
  emissaoFrom?: string;
  emissaoTo?: string;
  vencimentoFrom?: string;
  vencimentoTo?: string;
  valorMin?: string | number;
  valorMax?: string | number;
  filial?: string;
  centroCusto?: string;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useContasPagar(
  params: FinancialBaseFilters & {
    companyId?: string;
    status?: 'A_VENCER' | 'VENCIDO' | 'PAGO';
    search?: string;
    fornecedor?: string;
    groupByLancamento?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  return useQuery({
    queryKey: ['financial', 'contas-pagar', params],
    enabled: !!params.companyId,
    queryFn: async () => {
      const res = await api.get<ListResponse<ContaPagarRow>>(
        '/financial/contas-pagar',
        { params },
      );
      return res.data;
    },
  });
}

export function useIads(
  params: FinancialBaseFilters & {
    companyId?: string;
    status?: 'A_VENCER' | 'VENCIDO' | 'TODOS';
    search?: string;
    fornecedor?: string;
    semSv?: boolean;
    comSv?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  return useQuery({
    queryKey: ['financial', 'iads', params],
    enabled: !!params.companyId,
    queryFn: async () => {
      const res = await api.get<ListResponse<IadRow>>('/financial/iads', {
        params,
      });
      return res.data;
    },
  });
}

export function useProvisoes(
  params: FinancialBaseFilters & {
    companyId?: string;
    tipo?: string;
    search?: string;
    fornecedor?: string;
    statusAprovacao?: string;
    limit?: number;
    offset?: number;
  },
) {
  return useQuery({
    queryKey: ['financial', 'provisoes', params],
    enabled: !!params.companyId,
    queryFn: async () => {
      const res = await api.get<ListResponse<ProvisaoRow>>(
        '/financial/provisoes',
        { params },
      );
      return res.data;
    },
  });
}

/** Item de filial/centro de custo para dropdowns. */
export interface CodeName {
  code: string;
  name: string;
}

/** Fornecedor para combobox. */
export interface SupplierOption extends CodeName {
  razaoSocial?: string;
  cnpj?: string;
}

export function useFinancialSuppliers(params: {
  companyId?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['financial', 'suppliers', params.companyId, params.search],
    enabled: !!params.companyId,
    // Cache curto — usuário pode digitar várias vezes
    staleTime: 1000 * 30,
    queryFn: async () => {
      const res = await api.get<SupplierOption[]>('/financial/suppliers', {
        params,
      });
      return res.data;
    },
  });
}

/** Parcelas individuais de um título (drill-down do detalhe). */
export interface ContaPagarParcela {
  idParcela: string;
  vencimento: string | null;
  vencimentoReal: string | null;
  valorOriginal: number | string;
  valorAPagar: number | string;
  saldoDevido: number | string;
  totalPago: number | string;
  posicao: string | null;
  banco: string | null;
  numeroBancario: string | null;
  statusConciliacao: string | null;
  descStatusConciliacao: string | null;
  conciliadoDda: boolean | null;
}

/** Row da visão "Documento" — agrupa LANCAMENTO somando todos os itens. */
export interface ContaPagarDocumentoRow {
  lancamento: number | string;
  codClifor: string | null;
  nomeClifor: string | null;
  razaoSocial: string | null;
  cnpjCpf: string | null;
  fatura: string | null;
  emissao: string | null;
  vencimentoReal: string | null;
  valorOriginal: number | string;
  saldoDevido: number | string;
  totalPago: number | string;
  posicao: string | null;
  codFilial: string | null;
  razaoFilial: string | null;
  qtdItens: number;
  qtdParcelas: number;
}

/** Item contábil dentro de um documento — drill-down da visão documento. */
export interface ContaPagarItem {
  item: number | string;
  fatura: string | null;
  contaContabil: string | null;
  descConta: string | null;
  nomeClifor: string | null;
  valorOriginal: number | string;
  saldoDevido: number | string;
  qtdParcelas: number;
}

export function useContasPagarDocumentos(
  params: FinancialBaseFilters & {
    companyId?: string;
    status?: 'A_VENCER' | 'VENCIDO' | 'PAGO';
    search?: string;
    fornecedor?: string;
    limit?: number;
    offset?: number;
    /** Quando false, hook não dispara (usado pra alternar com a listagem por título). */
    enabled?: boolean;
  },
) {
  const { enabled, ...rest } = params;
  return useQuery({
    queryKey: ['financial', 'contas-pagar-documentos', rest],
    enabled: enabled !== false && !!rest.companyId,
    queryFn: async () => {
      const res = await api.get<ListResponse<ContaPagarDocumentoRow>>(
        '/financial/contas-pagar/documentos',
        { params: rest },
      );
      return res.data;
    },
  });
}

export function useContasPagarItens(params: {
  companyId?: string;
  lancamento?: number;
}) {
  return useQuery({
    queryKey: [
      'financial',
      'contas-pagar-itens',
      params.companyId,
      params.lancamento,
    ],
    enabled: !!params.companyId && params.lancamento !== undefined,
    queryFn: async () => {
      const res = await api.get<{ items: ContaPagarItem[] }>(
        '/financial/contas-pagar/itens',
        { params },
      );
      return res.data.items;
    },
  });
}

export function useContasPagarParcelas(params: {
  companyId?: string;
  lancamento?: number;
  item?: number;
}) {
  return useQuery({
    queryKey: [
      'financial',
      'contas-pagar-parcelas',
      params.companyId,
      params.lancamento,
      params.item,
    ],
    enabled:
      !!params.companyId &&
      params.lancamento !== undefined &&
      params.item !== undefined,
    queryFn: async () => {
      const res = await api.get<{ items: ContaPagarParcela[] }>(
        '/financial/contas-pagar/parcelas',
        { params },
      );
      return res.data.items;
    },
  });
}

export function useFinancialBranches(companyId?: string) {
  return useQuery({
    queryKey: ['financial', 'branches', companyId],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 30, // cache 30min — muda raramente
    queryFn: async () => {
      const res = await api.get<CodeName[]>('/financial/branches', {
        params: { companyId },
      });
      return res.data;
    },
  });
}

export interface CurrencyOption {
  code: string;
  name: string;
  isDefault: boolean;
}

export function useFinancialCurrencies(companyId?: string) {
  return useQuery({
    queryKey: ['financial', 'currencies', companyId],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 60, // moeda muda raramente — cache 1h
    queryFn: async () => {
      const res = await api.get<CurrencyOption[]>('/financial/currencies', {
        params: { companyId },
      });
      return res.data;
    },
  });
}

export function useFinancialCostCenters(companyId?: string) {
  return useQuery({
    queryKey: ['financial', 'cost-centers', companyId],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await api.get<CodeName[]>('/financial/cost-centers', {
        params: { companyId },
      });
      return res.data;
    },
  });
}

/** Saldo de uma SV no Linx (somatório de items + saldo aberto). */
export interface SvSaldo {
  svNumber: string;
  totalSolicitado: number;
  totalAPagar: number;
  itens: Array<{
    idItem: string;
    valorSolicitado: number;
    valorAPagar: number;
    valorAPagarCalc: number;
    vencimentoReal: string | null;
  }>;
}

/**
 * Busca saldo de uma lista de SVs no Linx. Devolve um Record indexado
 * pelo número da SV (string). Aceita lista grande (até 200 SVs no
 * mesmo request).
 */
export function useSvSaldos(params: {
  companyId?: string;
  svs?: string[];
}) {
  const list = (params.svs ?? []).filter(Boolean);
  const key = list.join(',');
  return useQuery({
    queryKey: ['financial', 'sv-saldos', params.companyId, key],
    enabled: !!params.companyId && list.length > 0,
    queryFn: async () => {
      const res = await api.get<{ saldos: Record<string, SvSaldo> }>(
        '/financial/sv-saldos',
        { params: { companyId: params.companyId, svs: key } },
      );
      return res.data.saldos;
    },
  });
}

export function useDdas(
  params: Omit<FinancialBaseFilters, 'filial' | 'centroCusto'> & {
    companyId?: string;
    status?: 'PENDENTE' | 'BAIXADO';
    search?: string;
    recebimentoFrom?: string;
    recebimentoTo?: string;
    groupByDuplicata?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  return useQuery({
    queryKey: ['financial', 'ddas', params],
    enabled: !!params.companyId,
    queryFn: async () => {
      const res = await api.get<ListResponse<DdaRow>>('/financial/ddas', {
        params,
      });
      return res.data;
    },
  });
}
