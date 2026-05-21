import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/* Tipos espelham as views v_p2p_product_orders / v_p2p_product_order_items. */

export interface PaOrder {
  empresa: string;
  pedido: string;
  fornecedor: string;
  filial: string;
  condicao_pgto: string | null;
  moeda: string;
  status_compra: string;
  status_aprovacao: string;
  lx_status_compra: number | null;
  tipo_compra: string;
  natureza_entrada: string | null;
  emissao: string;
  cadastramento: string;
  data_aprovacao: string | null;
  aprovado_por: string | null;
  requerido_por: string | null;
  tot_qtde_original: number | null;
  tot_qtde_entregar: number | null;
  tot_valor_original: string;
  tot_valor_entregar: string;
  obs: string | null;
}

export interface PaItem {
  empresa: string;
  pedido: string;
  produto: string;
  cor: string;
  entrega: string;
  limite_entrega: string | null;
  chegada_prevista: string | null;
  data_confirmacao: string | null;
  qtde_original: number | null;
  qtde_cancelada: number | null;
  qtde_entregue: number | null;
  qtde_entregar: number | null;
  valor_original: string;
  valor_entregue: string;
  valor_entregar: string;
  custo_unit: string;
  ipi_pct: string;
  desconto_item: string;
  obs_item: string | null;
}

export interface PaOrderDetail extends PaOrder {
  items: PaItem[];
  canApprovePa: boolean;
}

export interface PaGradeRow {
  posicao: number;
  qtdeOriginal: number;
  qtdeEntregue: number;
  tamanho: string | null;
}

export interface PaGrade {
  grade: string | null;
  rows: PaGradeRow[];
}

/** Lista pedidos PA da empresa. status: 'P', 'E', 'A', 'R', 'C', 'M' ou 'ALL'. */
export function usePaOrders(
  company?: string,
  params: { status?: string; search?: string } = {},
) {
  return useQuery({
    queryKey: ['pa-orders', company, params],
    queryFn: async () =>
      (
        await api.get<PaOrder[]>(`/product-orders-pa/${company}`, { params })
      ).data,
    enabled: !!company,
    staleTime: 60_000,
  });
}

export function usePaOrder(company?: string, pedido?: string) {
  return useQuery({
    queryKey: ['pa-order', company, pedido],
    queryFn: async () =>
      (
        await api.get<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}`,
        )
      ).data,
    enabled: !!company && !!pedido,
  });
}

export function useApprovePaOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ company, pedido }: { company: string; pedido: string }) =>
      (
        await api.post<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}/approve`,
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pa-orders', vars.company] });
      qc.invalidateQueries({ queryKey: ['pa-order', vars.company, vars.pedido] });
    },
  });
}

export function useRejectPaOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      company,
      pedido,
      reason,
    }: {
      company: string;
      pedido: string;
      reason: string;
    }) =>
      (
        await api.post<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}/reject`,
          { reason },
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pa-orders', vars.company] });
      qc.invalidateQueries({ queryKey: ['pa-order', vars.company, vars.pedido] });
    },
  });
}

export function usePaItemGrade(
  company?: string,
  pedido?: string,
  produto?: string,
  cor?: string,
  entrega?: string,
) {
  return useQuery({
    queryKey: ['pa-grade', company, pedido, produto, cor, entrega],
    queryFn: async () =>
      (
        await api.get<PaGrade>(`/product-orders-pa/${company}/${pedido}/grade`, {
          params: { produto, cor, entrega },
        })
      ).data,
    enabled: !!company && !!pedido && !!produto && !!cor && !!entrega,
  });
}
