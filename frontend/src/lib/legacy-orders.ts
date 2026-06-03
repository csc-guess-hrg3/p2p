import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { FinanceiroErp } from './purchase-orders';

/**
 * Cliente do módulo Pedidos Legados — pedidos consumível direto do Linx.
 * Admin-only. Read-through (nada persistido no P2P).
 */

export interface LegacyOrderRow {
  pedido: string;
  fornecedor: string;
  emissao: string | null;
  tipoCompra: string | null;
  statusCompra: string | null;
  statusAprovacao: string | null;
  lxStatusCompra: number | null;
  filialAEntregar: string | null;
  totQtdeOriginal: number;
  totQtdeEntregar: number;
  totValorOriginal: number;
  totValorEntregar: number;
  nfeCount: number;
  nfeWithChaveCount: number;
}

export interface LegacyOrderList {
  total: number;
  page: number;
  pageSize: number;
  company: { id: string; code: string; name: string };
  rows: LegacyOrderRow[];
}

export interface LegacyOrderQuery {
  companyId: string;
  search?: string;
  from?: string;
  to?: string;
  status?: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ALL';
  statusAprovacao?: 'A' | 'P' | 'R' | 'E';
  nfeFilter?: 'any' | 'with-nf' | 'with-chave';
  onlyWithNfe?: boolean;
  valorMin?: number;
  valorMax?: number;
  filial?: string;
  tipoCompra?: string;
  requeridoPor?: string;
  aprovadoPor?: string;
  page?: number;
  pageSize?: number;
}

export interface LegacyOrderFacets {
  filiais: string[];
  tiposCompra: string[];
  aprovadores: string[];
}

export function useLegacyOrderFacets(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['legacy-order-facets', companyId],
    enabled: !!companyId,
    staleTime: 60_000 * 10, // facets mudam pouco
    queryFn: async () =>
      (
        await api.get<LegacyOrderFacets>('/legacy-orders/facets', {
          params: { companyId },
        })
      ).data,
  });
}

export interface LegacyOrderItem {
  consumivel: string;
  descConsumivel: string | null;
  unidade: string | null;
  qtdeOriginal: number;
  qtdeEntregue: number;
  qtdeEntregar: number;
  qtdeCancel: number;
  custo: number;
  valorOriginal: number;
  valorEntregue: number;
  valorEntregar: number;
  rateioFilial: string | null;
  rateioCentroCusto: string | null;
  entrega: string | null;
}

export interface LegacyOrderNfe {
  nfEntrada: string;
  serieNf: string;
  nomeClifor: string;
  emissao: string | null;
  valorTotal: number;
  chaveNfe: string | null;
  canDownloadDanfe: boolean;
  canDownloadXml: boolean;
  fiscalDocumentId: string | null;
  fiscalDocumentStatus: string | null;
}

export interface LegacyOrderDetail {
  company: { id: string; code: string; name: string };
  header: {
    pedido: string;
    fornecedor: string;
    emissao: string | null;
    cadastramento: string | null;
    condicaoPgto: string | null;
    transportadora: string | null;
    tipoCompra: string | null;
    statusCompra: string | null;
    statusAprovacao: string | null;
    lxStatusCompra: number | null;
    filialAEntregar: string | null;
    requeridoPor: string | null;
    aprovadoPor: string | null;
    dataAprovacao: string | null;
    totQtdeOriginal: number;
    totQtdeEntregar: number;
    totValorOriginal: number;
    totValorEntregar: number;
    moeda: string | null;
    obs: string | null;
  };
  items: LegacyOrderItem[];
  nfes: LegacyOrderNfe[];
}

export function useLegacyOrders(params: LegacyOrderQuery) {
  return useQuery({
    queryKey: ['legacy-orders', params],
    enabled: !!params.companyId,
    queryFn: async () =>
      (
        await api.get<LegacyOrderList>('/legacy-orders', {
          params: { ...params, onlyWithNfe: params.onlyWithNfe ? 'true' : undefined },
        })
      ).data,
  });
}

export function useLegacyOrder(
  companyId: string | null | undefined,
  pedido: string | null | undefined,
) {
  return useQuery({
    queryKey: ['legacy-order', companyId, pedido],
    enabled: !!companyId && !!pedido,
    queryFn: async () =>
      (
        await api.get<LegacyOrderDetail>(
          `/legacy-orders/${companyId}/${pedido}`,
        )
      ).data,
  });
}

/**
 * Estado financeiro do pedido externo no Linx (faturado/pago) — mesmo
 * read-through dos pedidos do P2P. Reusa o tipo FinanceiroErp.
 */
export function useLegacyOrderFinanceiroErp(
  companyId: string | null | undefined,
  pedido: string | null | undefined,
) {
  return useQuery({
    queryKey: ['legacy-order-financeiro', companyId, pedido],
    enabled: !!companyId && !!pedido,
    staleTime: 0,
    queryFn: async () =>
      (
        await api.get<FinanceiroErp>(
          `/legacy-orders/${companyId}/${pedido}/financeiro-erp`,
        )
      ).data,
  });
}

/** Download DANFe por chave (read-through Qive). */
export async function downloadLegacyDanfe(chave: string): Promise<void> {
  const k = chave.replace(/\D/g, '');
  const res = await api.get(`/legacy-orders/danfe/${k}`, {
    responseType: 'blob',
  });
  const blob = new Blob([res.data as Blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DANFe-${k}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
